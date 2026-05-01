from django.db import models

class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name_plural = "Categories"

class Manga(models.Model):
    STATUS_CHOICES = [
        ('ONGOING', 'Lançando'),
        ('COMPLETED', 'Finalizado'),
        ('HIATUS', 'Hiato'),
    ]

    # Identificador Externo (O Elo com o MangaDex)
    mangadex_id = models.CharField(max_length=100, unique=True, null=True, blank=True)

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
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

    @property
    def cover_url(self) -> str:
        """Effective cover URL: local mirror if available, else MangaDex remote."""
        if self.cover_path:
            from django.conf import settings as dj_settings

            base = (dj_settings.MEDIA_URL or "/media/").rstrip("/")
            return f"{base}/{self.cover_path}"
        return self.cover or ""


class Chapter(models.Model):
    manga = models.ForeignKey(Manga, on_delete=models.CASCADE, related_name='chapters')
    # NOVO CAMPO DE RASTREIO:
    mangadex_id = models.CharField(max_length=100, unique=True, null=True, blank=True)

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
    
