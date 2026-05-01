"""Seed initial legal documents.

The text below is bespoke for Arasaka Nexus — a non-commercial, fan-built
manga reader that indexes content via the public MangaDex API. It is modelled
after industry references (MangaDex ToS, Mihon/Tachiyomi disclaimers, and
Brazilian-Portuguese conventions used by Crunchyroll BR) but rewritten for
this project's specific posture.

The operator can edit any of these from Django admin afterwards.
"""

from datetime import date

from django.db import migrations


TERMOS = """
# Termos de Uso

**Última atualização:** 30/04/2026

## 1. Sobre o serviço

O Arasaka Nexus ("Nexus", "serviço", "nós") é um projeto de fã, sem fins
lucrativos, que oferece uma interface unificada para descoberta e leitura de
mangás indexados a partir da **API pública do MangaDex**. Não somos afiliados,
patrocinados ou endossados pela MangaDex, pelos autores das obras ou pelas
editoras detentoras dos direitos.

O Nexus **não hospeda arquivos de mangá** em servidores próprios. Capas e
metadados podem ser armazenados em cache para garantir performance e
disponibilidade; quando isso ocorre, os direitos sobre tais arquivos
permanecem dos detentores originais.

## 2. Aceitação

Ao criar uma conta, ou ao continuar navegando após o aviso de cookies, você
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

## 6. Direitos autorais

Todo o material catalogado pertence aos seus respectivos autores e
editoras. Eventuais reclamações de direitos autorais devem ser enviadas
para o email indicado em [Aviso Legal](/aviso-legal). Após verificação,
removeremos rapidamente qualquer obra apontada por seu legítimo titular.

## 7. Disponibilidade e ausência de garantias

O serviço é fornecido **"no estado em que se encontra"**, sem garantias de
disponibilidade, exatidão ou continuidade. Podemos suspender, alterar ou
encerrar o Nexus a qualquer tempo, total ou parcialmente, sem aviso prévio.

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


PRIVACIDADE = """
# Política de Privacidade

**Última atualização:** 30/04/2026

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

## 4. Compartilhamento

Não vendemos nem alugamos seus dados. Os únicos compartilhamentos possíveis
são:

- Com a infraestrutura que hospeda o serviço (Cloudflare, provedor de
  servidor) na medida estritamente necessária para a operação.
- Com a API do MangaDex, **sem enviar seus dados pessoais** — apenas
  identificadores de mangá/capítulo.
- Mediante ordem judicial ou requisição de autoridade competente.

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


AVISO_LEGAL = """
# Aviso Legal & DMCA

**Última atualização:** 30/04/2026

## 1. Natureza do projeto

O Arasaka Nexus é um **projeto de fã, não-oficial e sem fins lucrativos**,
que utiliza a **API pública do MangaDex** como fonte de metadados e links
para capítulos. Não hospedamos os arquivos de mangá em servidores
próprios; o leitor consome as imagens através das URLs servidas pelos
provedores indicados pelo MangaDex.

Capas e metadados podem ser cacheados localmente para garantir
desempenho. Esses arquivos permanecem propriedade dos respectivos
detentores de direitos.

## 2. Direitos autorais

Todos os mangás, ilustrações, marcas e personagens exibidos pertencem
exclusivamente aos seus autores, ilustradores, editoras e demais
detentores legítimos de direitos. Nenhuma alegação de propriedade é
feita pelo Nexus sobre o material catalogado.

## 3. Procedimento de remoção (DMCA / Lei 9.610/1998)

Se você é detentor de direitos sobre uma obra catalogada e deseja
solicitar a remoção, envie um email para o endereço **DMCA** indicado no
rodapé contendo:

1. **Identificação do titular** (nome, razão social, CNPJ/CPF) e
   comprovação de legitimidade.
2. **Identificação da obra**: título, autor, edição, e o(s) link(s)
   exato(s) da página no Nexus que deseja remover.
3. **Declaração**, sob as penas da lei, de que as informações fornecidas
   são verdadeiras e de que você é o titular dos direitos ou está
   autorizado a agir em seu nome.
4. **Assinatura** (digital ou física) e dados de contato.

Após validação, o conteúdo será removido em até **72 horas** e a entrada
correspondente será marcada para não ser reimportada.

## 4. Solicitações abusivas

Notificações de remoção fraudulentas ou de má-fé estão sujeitas às
sanções civis e criminais previstas na legislação aplicável, incluindo
o art. 299 do Código Penal.

## 5. Isenção de garantias

As informações exibidas (sinopses, capítulos, datas) são fornecidas pelo
MangaDex e podem conter erros, lacunas ou divergências em relação ao
material original. Reportes de erro são bem-vindos pelo email de
**Suporte** no rodapé.

## 6. Marcas e personagens

"Arasaka" e demais elementos cyberpunk usados na identidade visual deste
projeto são referências culturais a obras e franquias de propriedade de
seus respectivos autores e editoras. **Não há vínculo, patrocínio ou
endosso** por parte dessas franquias.

## 7. Contato

Qualquer dúvida ou requisição relacionada a direitos autorais deve ser
direcionada exclusivamente ao email **DMCA** indicado no rodapé. Demais
assuntos podem ser tratados pelos canais de **Geral** ou **Suporte**.
""".strip()


SEED = [
    ("termos", "Termos de Uso", TERMOS, "1.0", date(2026, 4, 30)),
    ("privacidade", "Política de Privacidade", PRIVACIDADE, "1.0", date(2026, 4, 30)),
    ("aviso-legal", "Aviso Legal & DMCA", AVISO_LEGAL, "1.0", date(2026, 4, 30)),
]


def seed_legal(apps, schema_editor):
    LegalDocument = apps.get_model("site_config", "LegalDocument")
    SiteContact = apps.get_model("site_config", "SiteContact")

    for slug, title, body, version, eff in SEED:
        LegalDocument.objects.update_or_create(
            slug=slug,
            defaults={
                "title": title,
                "body_markdown": body,
                "version": version,
                "effective_date": eff,
            },
        )
    # Garante o singleton de contato existente.
    SiteContact.objects.get_or_create(pk=1)


def unseed_legal(apps, schema_editor):
    LegalDocument = apps.get_model("site_config", "LegalDocument")
    LegalDocument.objects.filter(
        slug__in=["termos", "privacidade", "aviso-legal"]
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("site_config", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_legal, unseed_legal),
    ]
