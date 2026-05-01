"""Atualização v2.0 dos documentos legais.

Refletir a nova realidade pós-multi-fonte:

- Antes: indexador da MangaDex API (single-source)
- Agora: agregador multi-fonte (MangaDex + MangaPlus + Mihon Network)

A v2.0 reescreve os 3 documentos para:
  - Termos: descrever explicitamente a agregação multi-fonte
  - Privacidade: detalhar o sidecar interno Suwayomi e o proxy de imagens
  - Aviso Legal: processo DMCA mais robusto, cobrindo scans BR via Mihon

Idempotente — `update_or_create` por slug. Invalida o cache após salvar.
"""

from datetime import date

from django.db import migrations


TERMOS_V2 = """
# Termos de Uso

**Versão:** 2.0
**Última atualização:** 01/05/2026

## 1. Sobre o serviço

O Arasaka Nexus ("Nexus", "serviço", "nós") é um projeto de fã, sem fins
lucrativos, que oferece uma interface unificada de descoberta e leitura de
mangás. Indexamos múltiplas fontes públicas:

- **MangaDex** — via API pública oficial.
- **MANGA Plus by Shueisha** — via API pública oficial (conteúdo legalmente
  publicado pela editora).
- **Mihon Network** — agregador da comunidade [Mihon](https://mihon.app/)
  (antigo Tachiyomi). Acessamos suas extensões através do
  [Suwayomi-Server](https://github.com/Suwayomi/Suwayomi-Server), um sidecar
  que executa as extensões nativamente. Cobre scanlators amadores em PT-BR e
  outros idiomas.

Não somos afiliados, patrocinados ou endossados por qualquer fonte indexada,
pelos autores das obras ou pelas editoras detentoras dos direitos.

O Nexus **não hospeda arquivos de mangá** em servidores próprios. Páginas
são proxiadas em tempo real do upstream para o usuário, com cache transitório
em CDN (Cloudflare). Capas e metadados podem ficar em cache local para
performance; quando isso ocorre, os direitos sobre tais arquivos permanecem
dos detentores originais.

## 2. Aceitação

Ao criar uma conta, ou continuar navegando após o aviso de cookies, você
declara ter lido, entendido e concordado com estes Termos e com a nossa
[Política de Privacidade](/privacidade). Se você não concorda com qualquer
item, **encerre o uso imediatamente**.

## 3. Idade mínima e classificação

- A idade mínima para criar conta é **13 anos** (em conformidade com o
  Estatuto da Criança e do Adolescente — Lei 8.069/1990 — e o art. 14 da
  LGPD).
- Conteúdo classificado como **erótico** ou **pornográfico** está disponível
  apenas para usuários com **18 anos ou mais** que tenham ativado
  manualmente a opção *Exibir conteúdo adulto* no perfil.
- A data de nascimento é registrada **uma única vez**. Para correção
  legítima, é necessário entrar em contato com a administração pelo email
  indicado no rodapé.

## 4. Conta e segurança

- Você é responsável por manter a confidencialidade da sua senha.
- O cadastro com informações falsas, especialmente quanto à idade, pode
  resultar em suspensão imediata.
- Reservamo-nos o direito de bloquear contas que violem estes Termos.

## 5. Conduta esperada

É vedado:

- Tentar contornar mecanismos de verificação de idade ou bloqueio de
  conteúdo.
- Realizar engenharia reversa, scraping em massa ou ataques contra a
  infraestrutura.
- Republicar, redistribuir ou comercializar conteúdo acessado pelo Nexus.
- Utilizar o serviço para qualquer atividade ilegal ou que viole direitos de
  terceiros.

## 6. Direitos autorais e remoção

Todo o material catalogado pertence aos seus respectivos autores, editoras
e tradutores (no caso de scanlators). Eventuais reclamações de direitos
autorais devem ser enviadas para o email indicado em
[Aviso Legal & DMCA](/aviso-legal). Após verificação, removeremos
prontamente qualquer obra apontada por seu legítimo titular — vide
processo detalhado naquele documento.

## 7. Disponibilidade e ausência de garantias

O serviço é fornecido **"no estado em que se encontra"**, sem garantias de
disponibilidade, exatidão ou continuidade. Podemos suspender, alterar ou
encerrar o Nexus a qualquer tempo, total ou parcialmente, sem aviso prévio.
Fontes externas podem ficar indisponíveis, mudar de domínio, ou ser
descontinuadas — quando isso ocorre, o Nexus pode falhar em mostrar
conteúdo daquela fonte sem que isso configure descumprimento de qualquer
obrigação.

## 8. Limitação de responsabilidade

Na máxima extensão permitida pela lei brasileira, o Nexus, seus mantenedores
e colaboradores não serão responsáveis por danos indiretos, lucros cessantes
ou perdas de dados decorrentes do uso (ou impossibilidade de uso) do serviço.

## 9. Alterações destes Termos

Podemos atualizar estes Termos a qualquer tempo. Mudanças relevantes serão
sinalizadas em banner e/ou por email. O uso continuado após a vigência da
nova versão implica concordância tácita.

## 10. Foro e legislação

Estes Termos são regidos pela legislação brasileira. Fica eleito o foro da
comarca do domicílio do usuário consumidor para dirimir eventuais
controvérsias.
""".strip()


PRIVACIDADE_V2 = """
# Política de Privacidade

**Versão:** 2.0
**Última atualização:** 01/05/2026

Esta Política descreve como o **Arasaka Nexus** trata dados pessoais à luz
da Lei Geral de Proteção de Dados Pessoais (**LGPD — Lei 13.709/2018**).

## 1. Quem é o controlador

O Arasaka Nexus é mantido por uma operação independente, sem fins
lucrativos. O contato do encarregado pelo tratamento de dados (DPO) é o
email **LGPD** listado no rodapé.

## 2. Quais dados coletamos

### 2.1 Fornecidos por você
- **Nome de usuário** e **email** (cadastro/login).
- **Senha** (armazenada com hash; nunca em texto puro).
- **Data de nascimento** (verificação de idade — definida uma única vez).
- **Bio**, idioma e modo de leitura preferidos (opcionais).

### 2.2 Coletados automaticamente
- **Cookies estritamente essenciais** para manter a sessão.
- Logs de acesso anonimizados (IP truncado, user-agent, timestamps) por até
  90 dias, exclusivamente para fins de segurança e estatística agregada.
- Histórico de leitura interno (capítulo atual, página, favoritos) para
  alimentar o leitor e a sua biblioteca.

**Não usamos** cookies de publicidade, fingerprinting nem ferramentas de
rastreamento de terceiros.

## 3. Para que usamos seus dados

| Finalidade | Base legal (LGPD) |
| --- | --- |
| Autenticação e operação da conta | Execução de contrato (art. 7, V) |
| Verificação de idade para conteúdo adulto | Cumprimento de obrigação legal (art. 7, II) |
| Estatísticas agregadas e segurança | Legítimo interesse (art. 7, IX) |
| Comunicação operacional | Execução de contrato (art. 7, V) |

## 4. Compartilhamento e infraestrutura

Não vendemos nem alugamos seus dados. A infraestrutura técnica que processa
sua sessão é toda **interna ou tradicional** (não há trackers de terceiros):

- **Cloudflare** — proxy reverso e CDN. Recebe cabeçalhos HTTP padrão
  (mesmo conjunto de qualquer site que use a Cloudflare).
- **Servidor próprio** — backend Django + PostgreSQL onde sua conta e
  preferências ficam armazenadas.
- **Suwayomi-Server** — sidecar interno que executa as extensões da
  comunidade Mihon. Roda na mesma rede privada do nosso backend; **não
  compartilha seus dados pessoais** — só recebe identificadores de obras
  e capítulos para resolver URLs de página.
- **APIs públicas externas** (MangaDex, MANGA Plus, scanlators acessados
  via Mihon) — recebem somente identificadores de mangá/capítulo,
  **nunca seus dados pessoais**.

Para evitar que seu IP seja exposto a sites de terceiros, **todas as
páginas e capas externas são proxiadas pelo nosso backend** antes de
chegarem ao seu navegador. Resultado prático: seu provedor de internet vê
apenas tráfego entre você e o Arasaka Nexus; nenhum site de scanlator vê
seu IP.

Mediante ordem judicial ou requisição de autoridade competente,
podemos ser compelidos a compartilhar registros mínimos de acesso.

## 5. Retenção

- Conta ativa: pelo tempo em que sua conta existir.
- Após exclusão da conta, seus dados pessoais são removidos em até 30 dias,
  exceto registros legalmente exigidos.
- Logs anonimizados: até 90 dias.

## 6. Seus direitos (art. 18 da LGPD)

Você pode, gratuitamente, solicitar:

- Confirmação da existência de tratamento.
- Acesso aos seus dados.
- Correção de dados incompletos, inexatos ou desatualizados.
- Anonimização, bloqueio ou eliminação de dados desnecessários.
- Portabilidade.
- Revogação de consentimento.
- Eliminação dos dados tratados com base no consentimento.

Para exercer esses direitos, escreva para o email **LGPD** do rodapé.
Responderemos no prazo legal de **15 dias**.

## 7. Segurança

Aplicamos boas práticas de segurança: TLS em todas as conexões, hash forte
de senhas, rate limiting, segregação de redes e atualizações periódicas.
Apesar disso, nenhum sistema é infalível — comunique imediatamente
qualquer suspeita de incidente.

## 8. Crianças e adolescentes

O cadastro é vedado a menores de 13 anos. Para usuários entre 13 e 18, o
acesso a conteúdo classificado como adulto é tecnicamente bloqueado.

## 9. Alterações

Mudanças relevantes nesta Política serão comunicadas por banner e/ou email.
A versão vigente é sempre a publicada nesta página, com data de atualização
no topo.
""".strip()


AVISO_LEGAL_V2 = """
# Aviso Legal & DMCA

**Versão:** 2.0
**Última atualização:** 01/05/2026

## 1. Natureza do projeto

O Arasaka Nexus é um **projeto de fã, não-oficial e sem fins lucrativos**
que opera como **agregador multi-fonte** de mangás. Acessamos:

- **MangaDex** via API pública.
- **MANGA Plus** via API oficial Shueisha.
- **Mihon Network** — extensões da comunidade Mihon/Tachiyomi executadas
  via [Suwayomi-Server](https://github.com/Suwayomi/Suwayomi-Server)
  (sidecar interno).

Nenhum arquivo de mangá é hospedado em nossos servidores. As páginas são
proxiadas em tempo real do upstream para o leitor, com cache transitório
em CDN (Cloudflare) por motivos de desempenho. Capas e metadados podem
permanecer em cache local; tais arquivos seguem sendo propriedade dos
respectivos detentores de direitos.

## 2. Direitos autorais

Todos os mangás, ilustrações, marcas e personagens exibidos pertencem
exclusivamente aos seus autores, ilustradores, editoras, scanlators
(equipes de tradução amadora) e demais detentores legítimos. Nenhuma
alegação de propriedade é feita pelo Nexus sobre o material catalogado.
Quando uma fonte (em especial scanlators amadores) deixa de operar ou
publicar, o conteúdo correspondente pode tornar-se inacessível pelo
Nexus sem que isso afete os direitos do titular.

## 3. Procedimento de remoção (DMCA / Lei 9.610/1998)

Se você é detentor de direitos sobre uma obra catalogada — ou
representante legal autorizado — e deseja solicitar a remoção, envie
um email para o endereço **DMCA** indicado no rodapé contendo
**obrigatoriamente**:

1. **Identificação do titular**: nome completo, razão social,
   CNPJ/CPF, endereço, telefone e comprovação de legitimidade
   (cópia de registro autoral, contrato de licenciamento, ou
   procuração quando for representante).
2. **Identificação da obra**: título, autor, edição/idioma e o(s)
   link(s) **exatos** da página no Arasaka Nexus que deseja remover
   (formato `https://nexus.arasaka.fun/manga/<id>` ou
   `https://nexus.arasaka.fun/read/<id>`).
3. **Identificação da fonte indexada** (MangaDex, MANGA Plus, ou nome
   da extensão Mihon, ex. *Lycan Toons*, *Sagrado Império*, etc).
   Isso ajuda a remoção a ser definitiva — não bastaria desindexar
   só uma fonte se a obra estivesse replicada em várias.
4. **Declaração**, sob as penas da lei, de que as informações
   fornecidas são verdadeiras e de que você é o titular dos direitos
   ou está autorizado a agir em seu nome.
5. **Assinatura** (digital ou física) e dados de contato para
   correspondência.

### Tempo de resposta

- **Acuso de recebimento:** até 24 horas após o email chegar.
- **Análise:** até **72 horas úteis** para validar a notificação.
- **Remoção:** **imediata** após validação. Marcamos a entrada como
  inativa em todas as fontes; ela não será reimportada por nenhum
  job de sincronização automática.

### Após a remoção

A entrada removida fica em quarentena permanente em nosso DB para
prevenir reimportação acidental. Se você fornecer um identificador
externo (UUID MangaDex, ID MangaPlus, slug de extensão Mihon, etc),
adicionamos esse identificador a uma denylist global.

## 4. Notificações abusivas

Notificações de remoção fraudulentas, exageradas ou de má-fé estão
sujeitas às sanções civis e criminais previstas na legislação aplicável,
incluindo:

- Falsidade ideológica (Código Penal, art. 299).
- Crime contra a economia popular (caso configurado).
- Responsabilidade civil por danos.

Reservamo-nos o direito de tornar pública qualquer notificação claramente
fraudulenta após análise interna.

## 5. Conteúdo adulto

Material classificado como **erótico** ou **pornográfico** é exibido
apenas para usuários adultos verificados (≥ 18 anos) que ativaram
manualmente a opção no perfil. Mais detalhes em
[Política de Privacidade](/privacidade) e [Termos de Uso](/termos).

## 6. Isenção de garantias técnicas

As informações exibidas (sinopses, capítulos, datas, traduções)
são fornecidas pelas fontes externas e podem conter erros, lacunas
ou divergências em relação ao material original. Reportes de erro
são bem-vindos pelo email de **Suporte** no rodapé.

A disponibilidade de capítulos e páginas depende da operação contínua
das fontes externas. Quando uma scan ou domínio sai do ar, o conteúdo
correspondente pode ficar inacessível mesmo após uma re-tentativa.

## 7. Marcas e personagens

"Arasaka" e demais elementos cyberpunk usados na identidade visual deste
projeto são referências culturais a obras e franquias de propriedade de
seus respectivos autores e editoras. **Não há vínculo, patrocínio ou
endosso** por parte dessas franquias.

## 8. Contato

| Assunto | Email (configurável pela administração) |
| --- | --- |
| Direitos autorais / DMCA | Endereço **DMCA** no rodapé |
| Privacidade / LGPD | Endereço **LGPD** no rodapé |
| Suporte técnico / bugs | Endereço **Suporte** no rodapé |
| Outros assuntos | Endereço **Geral** no rodapé |

Os emails são gerenciados pela administração e podem ser atualizados
sem mudança neste documento — sempre consulte o rodapé para os
endereços vigentes.
""".strip()


SEED_V2 = [
    ("termos", "Termos de Uso", TERMOS_V2, "2.0", date(2026, 5, 1)),
    ("privacidade", "Política de Privacidade", PRIVACIDADE_V2, "2.0", date(2026, 5, 1)),
    ("aviso-legal", "Aviso Legal & DMCA", AVISO_LEGAL_V2, "2.0", date(2026, 5, 1)),
]


def update_legal_v2(apps, schema_editor):
    LegalDocument = apps.get_model("site_config", "LegalDocument")

    for slug, title, body, version, eff in SEED_V2:
        LegalDocument.objects.update_or_create(
            slug=slug,
            defaults={
                "title": title,
                "body_markdown": body,
                "version": version,
                "effective_date": eff,
            },
        )

    # Invalida o cache do API endpoint pra que a v2 apareca imediatamente.
    try:
        from django.core.cache import cache

        for slug, *_ in SEED_V2:
            cache.delete(f"site:legal:{slug}")
    except Exception:
        # Cache invalidation e best-effort; o TTL natural eh 5min.
        pass


class Migration(migrations.Migration):
    dependencies = [
        ("site_config", "0002_seed_legal_documents"),
    ]

    operations = [
        migrations.RunPython(update_legal_v2, migrations.RunPython.noop),
    ]
