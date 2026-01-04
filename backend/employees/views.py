from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
import requests
from .tasks import task_import_manga_chapters
# Imports dos Modelos e Serializers
from .models import Manga, Category, Chapter, ChapterImage
from .serializers import (
    MangaSerializer, 
    CategorySerializer, 
    ChapterSerializer, 
    ChapterImageSerializer
)
from .services import get_mangadex_pages, MangaDexScanner

# --- PARTE 1: O SITE (ViewSets) ---

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

class MangaViewSet(viewsets.ModelViewSet):
    queryset = Manga.objects.all()
    serializer_class = MangaSerializer

class ChapterViewSet(viewsets.ModelViewSet):
    # --- A CORREÇÃO ESTÁ AQUI ---
    # Precisamos declarar o queryset padrão para o Router não dar erro 500,
    # mesmo que a função get_queryset abaixo mude tudo depois.
    queryset = Chapter.objects.all()
    serializer_class = ChapterSerializer

    def get_queryset(self):
        """
        Sobrescreve a busca padrão para permitir filtrar por mangá.
        Uso: /api/chapters/?manga=ID
        """
        # Começa com todos
        queryset = Chapter.objects.all()
        
        # Pega o parametro da URL
        manga_id = self.request.query_params.get('manga', None)
        
        # Se tiver ID, filtra. Se não tiver, retorna tudo (ou vazio, se preferir segurança)
        if manga_id is not None:
            queryset = queryset.filter(manga_id=manga_id)
            
        return queryset

# --- PARTE 2: O LEITOR (Streaming + Navegação) ---
@api_view(['GET'])
def get_chapter_pages(request, chapter_id):
    chapter = get_object_or_404(Chapter, id=chapter_id)
    
    # Navegação (Prev/Next)
    # Filtramos apenas os irmãos DESTE mangá para calcular a navegação
    siblings = Chapter.objects.filter(manga=chapter.manga).order_by('number')
    siblings_list = list(siblings)
    
    try:
        current_index = siblings_list.index(chapter)
    except ValueError:
        current_index = 0
    
    prev_chapter_id = None
    next_chapter_id = None
    
    # Lógica de navegação
    if current_index > 0:
        prev_chapter_id = siblings_list[current_index - 1].id
    if current_index < len(siblings_list) - 1:
        next_chapter_id = siblings_list[current_index + 1].id

    # Busca Imagens (Híbrido)
    pages = []
    source = "LOCAL"

    local_images = ChapterImage.objects.filter(chapter=chapter).order_by('order')
    if local_images.exists():
        serializer = ChapterImageSerializer(local_images, many=True)
        pages = serializer.data
    elif chapter.mangadex_id:
        source = "MANGADEX_STREAM"
        pages = get_mangadex_pages(chapter.mangadex_id)

    return Response({
        "source": source,
        "manga_id": chapter.manga.id,
        "manga_title": chapter.manga.title,
        "chapter_number": chapter.number,
        "title": chapter.title,
        "pages": pages,
        "navigation": {
            "prev": prev_chapter_id,
            "next": next_chapter_id
        }
    })

# --- PARTE 3: A BUSCA HÍBRIDA (Omni-Search) ---
@api_view(['GET'])
def search_mangas(request):
    query = request.query_params.get('q', '').strip()
    if not query:
        return Response([])

    results = []
    
    # 1. Busca Local
    local_mangas = Manga.objects.filter(title__icontains=query)[:5]
    local_dex_ids = []
    
    for m in local_mangas:
        local_dex_ids.append(m.mangadex_id)
        results.append({
            "id": m.id,
            "title": m.title,
            "cover": m.cover,
            "mangadex_id": m.mangadex_id,
            "in_library": True
        })

    # 2. Busca Externa (MangaDex)
    if len(query) > 2:
        scanner = MangaDexScanner()
        external_mangas = scanner.search_manga(query)
        
        for ext in external_mangas:
            # Só adiciona se NÃO estiver na lista local
            if ext['mangadex_id'] not in local_dex_ids:
                results.append({
                    "id": ext['mangadex_id'], # ID temporário
                    "title": ext['title'],
                    "cover": ext['cover'],
                    "mangadex_id": ext['mangadex_id'],
                    "in_library": False,
                    "description": ext['description'],
                    "status": ext['status']
                })

    return Response(results)

# --- PARTE 4: IMPORTAÇÃO AUTOMÁTICA ---
@api_view(['POST'])
def import_manga(request):
    """
    Endpoint de Importação Assíncrona.
    Responde em milissegundos, enquanto o servidor trabalha em background.
    """
    data = request.data
    dex_id = data.get('mangadex_id')
    
    if not dex_id:
        return Response({"error": "ID do MangaDex não fornecido"}, status=400)

    # 1. Verifica se já existe localmente
    existing = Manga.objects.filter(mangadex_id=dex_id).first()
    
    # 2. Dispara o trabalho para o Celery (Isso é instantâneo)
    # O método .delay() coloca a tarefa na fila do Redis
    task = task_import_manga_chapters.delay(dex_id)
    
    if existing:
        msg = "Mangá já existe. Atualização iniciada em background."
        manga_id = existing.id
        created = False
    else:
        msg = "Importação iniciada em background. Você será notificado quando terminar."
        manga_id = None # Ainda não temos o ID, pois será criado pelo Worker
        created = True

    # 3. Retorna imediatamente para o Frontend
    return Response({
        "status": "processing",
        "task_id": task.id,
        "message": msg,
        "manga_id": manga_id, # Pode ser null se for novo
        "created": created
    }, status=202) # 202 Accepted (Recebido, mas não completado)
    
# --- NOVO: ENDPOINT DA HOME INTELIGENTE ---
@api_view(['GET'])
def home_content(request):
    """
    Endpoint mestre da Home.
    Retorna 3 listas:
    1. Destaques (Populares)
    2. Recém Adicionados (Novos no sistema)
    3. Atualizações (Mangás com capítulos recentes)
    """
    
    # 1. VERIFICAÇÃO DE VAZIO (Protocolo Genesis)
    if Manga.objects.count() < 5:
        print("--- BANCO VAZIO DETECTADO. INICIANDO POPULAÇÃO AUTOMÁTICA ---")
        scanner = MangaDexScanner()
        # Baixa os populares para preencher a vitrine
        scanner.sync_popular_mangas() 
    
    # 2. COLETA DE DADOS LOCAIS
    # Recomendados (Aleatório ou por status)
    featured = Manga.objects.all().order_by('?')[:10] 
    
    # Adicionados Recentemente (Pelo ID decrescente, ou seja, os últimos criados)
    recently_added = Manga.objects.all().order_by('-id')[:10]

    # Prepara o JSON estruturado
    data = {
        "featured": [
            {
                "id": m.id,
                "title": m.title,
                "cover": m.cover,
                "categories": [c.name for c in m.categories.all()[:3]] # Manda as tags
            } for m in featured
        ],
        "recent": [
            {
                "id": m.id,
                "title": m.title,
                "cover": m.cover,
                "status": m.status
            } for m in recently_added
        ]
    }
    
    return Response(data)