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
    
    # MUDANÇA TÁTICA: CharField para aceitar URL externa OU caminho local
    cover = models.CharField(max_length=500, blank=True, null=True) 
    
    author = models.CharField(max_length=100, default="Desconhecido")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ONGOING')
    categories = models.ManyToManyField(Category, related_name='mangas', blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

class Chapter(models.Model):
    manga = models.ForeignKey(Manga, on_delete=models.CASCADE, related_name='chapters')
    # NOVO CAMPO DE RASTREIO:
    mangadex_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    
    number = models.DecimalField(max_digits=6, decimal_places=1)
    title = models.CharField(max_length=255, blank=True, null=True)
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
    
