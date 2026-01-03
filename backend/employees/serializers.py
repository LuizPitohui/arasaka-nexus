from rest_framework import serializers
from .models import Manga, Category, Chapter, ChapterImage

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'

class ChapterImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChapterImage
        fields = ['id', 'image', 'order']

class ChapterSerializer(serializers.ModelSerializer):
    # Agora o capítulo carrega suas páginas junto
    images = ChapterImageSerializer(many=True, read_only=True)
    
    class Meta:
        model = Chapter
        fields = '__all__'

class MangaSerializer(serializers.ModelSerializer):
    categories = CategorySerializer(many=True, read_only=True)
    # Importante: No card do mangá, não precisamos carregar as imagens das páginas (pesaria muito)
    # Então usamos um serializer simplificado ou mantemos como estava,
    # mas o ChapterSerializer acima já resolve a visualização detalhada.
    chapters = ChapterSerializer(many=True, read_only=True)
    
    class Meta:
        model = Manga
        fields = '__all__'