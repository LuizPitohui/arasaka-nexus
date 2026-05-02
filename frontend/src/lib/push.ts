/**
 * Web Push helpers (lado client).
 *
 * Roteiro:
 *   1. supportsPush()        — checa Notification API + Service Worker
 *   2. getCurrentSubscription() — devolve sub atual ou null
 *   3. enablePush()          — pede permissao, subscribe(), envia pro backend
 *   4. disablePush()         — unsubscribe local + DELETE no backend
 *
 * VAPID public key vem em NEXT_PUBLIC_VAPID_PUBLIC_KEY (gerada via
 * `python manage.py generate_vapid`). Sem essa env, push fica desabilitada
 * — supportsPush() devolve false e UI esconde toggle.
 */

import { api } from '@/lib/api';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

/** True se o navegador suporta E temos VAPID key configurada. */
export function supportsPush(): boolean {
  if (typeof window === 'undefined') return false;
  if (!VAPID_PUBLIC_KEY) return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Notification.permission ('default' | 'granted' | 'denied'). */
export function permissionState(): NotificationPermission | null {
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window)) return null;
  return Notification.permission;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  // ready resolve quando ha um SW ativo controlando a pagina; em cold start
  // pode esperar ate ele instalar/ativar.
  return navigator.serviceWorker.ready;
}

/** Devolve a subscription do device atual, ou null. */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!supportsPush()) return null;
  const reg = await getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/**
 * Pede permissao, faz subscribe no PushManager e POST no backend.
 *
 * Retorna a PushSubscription criada (ou existente, se ja tava ativa).
 * Lanca em:
 *   - permission negada
 *   - SW nao registrado
 *   - VAPID nao configurada
 *   - falha no backend
 */
export async function enablePush(): Promise<PushSubscription> {
  if (!supportsPush()) {
    throw new Error('push-not-supported');
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error('permission-denied');
  }

  const reg = await getRegistration();
  if (!reg) throw new Error('sw-not-ready');

  // Reaproveita se ja existe
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  // Manda pro backend (idempotente — update_or_create por endpoint)
  await api.post('/accounts/push/subscribe/', sub.toJSON());

  return sub;
}

/** Manda 1 push de teste pro proprio user (todas as subs no backend). */
export async function sendTestPush(): Promise<{ delivered: number }> {
  return api.post<{ delivered: number }>('/accounts/push/test/', {});
}

/** Cancela no client + remove do backend. */
export async function disablePush(): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    // segue mesmo se unsubscribe local falhar — backend ainda precisa apagar
  }
  try {
    await api.post('/accounts/push/unsubscribe/', { endpoint });
  } catch {
    // backend offline / 401 — local ja limpou, ok aceitar drift temporario
  }
}

// VAPID public key vem em base64url. PushManager.subscribe quer
// BufferSource — alocamos ArrayBuffer explicito pra evitar fricao com
// o typing strict de Uint8Array<ArrayBufferLike> em TS lib mais nova.
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = typeof atob === 'function' ? atob(base64) : '';
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}
