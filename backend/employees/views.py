@api_view(['GET'])
def get_chapter_pages(request, chapter_id):
    # 1. Identificar o alvo
    chapter = get_object_or_404(Chapter, id=chapter_id)
    
    # 2. Calcular Navegação (Quem é o anterior e o próximo?)
    # Pegamos todos os capítulos DESTE mangá, ordenados por número
    siblings = Chapter.objects.filter(manga=chapter.manga).order_by('number')
    
    # Converte para lista para achar os índices
    siblings_list = list(siblings)
    current_index = siblings_list.index(chapter)
    
    prev_chapter_id = None
    next_chapter_id = None
    
    # Se não for o primeiro da lista, tem anterior (Capítulo MENOR)
    if current_index > 0:
        prev_chapter_id = siblings_list[current_index - 1].id
        
    # Se não for o último, tem próximo (Capítulo MAIOR)
    if current_index < len(siblings_list) - 1:
        next_chapter_id = siblings_list[current_index + 1].id

    # 3. Preparar o pacote de imagens
    pages = []
    source = "LOCAL"

    # Tenta Local
    local_images = ChapterImage.objects.filter(chapter=chapter).order_by('order')
    if local_images.exists():
        serializer = ChapterImageSerializer(local_images, many=True)
        pages = serializer.data
    # Tenta Stream
    elif chapter.mangadex_id:
        source = "MANGADEX_STREAM"
        pages = get_mangadex_pages(chapter.mangadex_id)
    else:
        return Response({"error": "Capítulo vazio (sem fonte)."}, status=404)

    # 4. Resposta Completa com Navegação
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