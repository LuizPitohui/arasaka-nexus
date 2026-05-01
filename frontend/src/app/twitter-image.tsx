// Twitter/X aceita 1200x630 idêntico ao OG. Mesmo render que
// opengraph-image.tsx (Next.js exige exports estáticos, sem re-export).

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Arasaka Nexus — Manga Library';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '72px 96px',
          background:
            'linear-gradient(135deg, #050505 0%, #0a0a0a 40%, #1a0505 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#f5f5f5',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background:
              'linear-gradient(90deg, transparent, #dc2626 25%, #dc2626 75%, transparent)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '28px',
            left: '28px',
            width: '40px',
            height: '40px',
            borderTop: '2px solid #dc2626',
            borderLeft: '2px solid #dc2626',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '28px',
            right: '28px',
            width: '40px',
            height: '40px',
            borderBottom: '2px solid #dc2626',
            borderRight: '2px solid #dc2626',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '28px',
            marginBottom: '24px',
          }}
        >
          <svg
            width="120"
            height="120"
            viewBox="0 0 64 64"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 56 L34 8 L58 56"
              stroke="#22d3ee"
              strokeWidth="0.8"
              fill="none"
              opacity="0.45"
            />
            <path
              d="M8 56 L32 8 L56 56"
              stroke="#dc2626"
              strokeWidth="3"
              fill="none"
            />
            <path
              d="M18 56 L32 28 L46 56"
              stroke="#dc2626"
              strokeWidth="2"
              fill="none"
              opacity="0.7"
            />
            <path
              d="M16 42 L26 42 M38 42 L48 42"
              stroke="#dc2626"
              strokeWidth="2.5"
            />
            <rect x="30" y="36" width="4" height="4" fill="#dc2626" />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: '20px',
                color: '#dc2626',
                letterSpacing: '0.4em',
                fontWeight: 700,
                marginBottom: '6px',
              }}
            >
              // PROTOCOL_07
            </div>
            <div
              style={{
                fontSize: '88px',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                lineHeight: 1,
                display: 'flex',
              }}
            >
              <span style={{ color: '#f5f5f5' }}>ARASAKA</span>
              <span style={{ color: '#dc2626', marginLeft: '16px' }}>NEXUS</span>
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: '36px',
            color: '#9a9a9a',
            maxWidth: '900px',
            lineHeight: 1.3,
            marginTop: '32px',
            letterSpacing: '-0.01em',
          }}
        >
          Biblioteca digital de mangás com leitor integrado e estética cyberpunk.
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            left: '96px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            fontSize: '18px',
            color: '#5a5a5a',
            letterSpacing: '0.3em',
            fontWeight: 600,
          }}
        >
          <span style={{ color: '#22d3ee' }}>● NET_OK</span>
          <span>·</span>
          <span>NEXUS.ARASAKA.FUN</span>
          <span>·</span>
          <span style={{ color: '#dc2626' }}>READ_ONLINE</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
