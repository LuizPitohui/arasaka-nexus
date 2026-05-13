from django.db import models

class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name_plural = "Categories"

class Work(models.Model):
    """Obra canônica — agrupa variantes de um mesmo mangá vindas de fontes
    diferentes (MangaDex, Mihon/Suwayomi, MangaPlus, ...).

    A mesma obra ("Solo Leveling", por exemplo) tipicamente entra no catálogo
    como 2-3 ``Manga`` distintos, um por fonte, com ``mangadex_id`` diferente.
    Sem uma camada canônica em cima:

      - O usuário precisa favoritar cada variante separadamente.
      - O Vault mostra cards duplicados.
      - Marcar capítulo como lido em uma fonte não reflete na outra.
      - Notificações de capítulo novo viram 3 push pro mesmo capítulo.

    ``Work`` resolve isso: cada ``Manga`` aponta pra uma ``Work``, e a UI
    agrupa por ``work`` ao listar Vault / busca. O matching automático é
    feito por título normalizado (`normalized_title`, único). Mismatches
    podem ser corrigidos via admin (``Manga.work = X``).
    """

    canonical_title = models.CharField(max_length=255)
    normalized_title = models.CharField(max_length=255, db_index=True, unique=True)
    slug = models.SlugField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["canonical_title"]

    def __str__(self):
        return self.canonical_title


class Manga(models.Model):
    STATUS_CHOICES = [
        ('ONGOING', 'Lançando'),
        ('COMPLETED', 'Finalizado'),
        ('HIATUS', 'Hiato'),
    ]

    # Identificador Externo (O Elo com a fonte)
    # Para mangadex: UUID puro (ex.: "abc-123-...")
    # Para mihon:   prefixado "mihon:<inner_source_id>:<suwayomi_manga_id>"
    mangadex_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    # Origem do mangá. Define o fluxo do reader (LOCAL / MANGADEX_STREAM /
    # MIHON_STREAM) e qual cliente buscar metadados/páginas.
    source_id = models.CharField(max_length=20, default="mangadex", db_index=True)

    title = models.CharField(max_length=255)
    alternative_title = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True) # Deixei opcional para evitar erros na importação
    
    # External cover URL (MangaDex CDN). Kept as fallback when local mirror not yet downloaded.
    cover = models.CharField(max_length=500, blank=True, null=True)
    # Local mirrored cover relative to MEDIA_ROOT, e.g. "covers/0042.jpg".
    # Populated by ``task_download_cover``; serializer prefers it over ``cover``.
    cover_path = models.CharField(max_length=300, blank=True, null=True)

    author = models.CharField(max_length=100, default="Desconhecido")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ONGOING')
    # Mirrored from MangaDex `attributes.contentRating`. Used to gate adult
    # content behind age verification.
    CONTENT_RATING_CHOICES = [
        ('safe', 'Safe'),
        ('suggestive', 'Suggestive'),
        ('erotica', 'Erotica'),
        ('pornographic', 'Pornographic'),
    ]
    content_rating = models.CharField(
        max_length=20,
        choices=CONTENT_RATING_CHOICES,
        default='safe',
        db_index=True,
    )
    categories = models.ManyToManyField(Category, related_name='mangas', blank=True)
    # FK opcional pra ``Work`` (obra canônica). Quando preenchido, agrupa
    # esse Manga com outras variantes de outras fontes no Vault e na busca.
    # Pode ser NULL temporariamente (recém-importado antes do hook attach)
    # ou se o admin desfez o vínculo. Veja ``employees.work_matcher``.
    work = models.ForeignKey(
        Work,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mangas",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

    @property
    def cover_url(self) -> str:
        """Effective cover URL: local mirror if available, else upstream.

        Safety net: covers internas do Suwayomi (rede docker) que vazaram
        do import sem normalizacao sao reescritas pra ir pelo proxy
        publico ``/api/cdn/mihon-cover/<external_id>/`` — sem essa
        traducao, o browser bateria em ``http://suwayomi:4567/...`` e
        falharia (host nao roteavel) entrando em loop de retry no <img>.
        """
        if self.cover_path:
            from django.conf import settings as dj_settings

            base = (dj_settings.MEDIA_URL or "/media/").rstrip("/")
            return f"{base}/{self.cover_path}"
        cover = self.cover or ""
        if "/api/v1/manga/" in cover and "/thumbnail" in cover:
            if self.mangadex_id and self.mangadex_id.startswith("mihon:"):
                external_id = self.mangadex_id[len("mihon:"):]
                return f"/api/cdn/mihon-cover/{external_id}/"
        return cover


class Chapter(models.Model):
    manga = models.ForeignKey(Manga, on_delete=models.CASCADE, related_name='chapters')
    # External id na fonte. Para mangadex e UUID; para mihon e o chapterId
    # interno do Suwayomi (string numerica).
    mangadex_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    # Denormalizado de Manga.source_id pra branch rapido no reader.
    source_id = models.CharField(max_length=20, default="mangadex", db_index=True)

    number = models.DecimalField(max_digits=6, decimal_places=1)
    title = models.CharField(max_length=255, blank=True, null=True)
    # Idioma da tradução (ex: "pt-br", "en", "es-la"). Vem do attributes.translatedLanguage
    # do MangaDex. Indexado para filtragem na listagem.
    translated_language = models.CharField(
        max_length=10,
        blank=True,
        default="",
        db_index=True,
    )
    # Data REAL de publicação no scanlator/agregador (vem do upstream).
    # MangaDex envia attributes.publishAt (ISO 8601); Mihon envia uploadDate
    # (ms epoch). Quando NULL, caímos para release_date no ordering de /latest.
    published_at = models.DateTimeField(null=True, blank=True, db_index=True)
    # Data em que a row entrou no nosso DB (auto). Usada como fallback quando
    # published_at é NULL. Mantém legacy chapters ordenáveis.
    release_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-number']

    def __str__(self):
        return f"{self.manga.title} - Cap {self.number}"
    
class ChapterImage(models.Model):
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='chapter_pages/')
    order = models.PositiveIntegerField(default=0) 

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.chapter} - Page {self.order}"
    
