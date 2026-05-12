"""Modelo Work canonical + backfill.

Schema:
  - Tabela ``employees_work`` com canonical_title, normalized_title (unique),
    slug (unique), created_at.
  - Coluna ``work_id`` em ``employees_manga`` (nullable, on_delete=SET_NULL).

Backfill (forward):
  - Para cada Manga existente, normaliza title, faz get_or_create da Work
    e vincula. Mangas com mesmo normalized_title acabam na mesma Work.

Reverse: drop work_id e tabela work. Não restaura dados (mas a info estava
toda derivada de Manga.title, então é reversível na prática).
"""

from django.db import migrations, models


def _normalize(raw: str) -> str:
    import re
    import unicodedata

    if not raw:
        return ""
    s = unicodedata.normalize("NFKD", raw)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().strip()
    s = re.sub(r"[^\w\s]", " ", s, flags=re.UNICODE)
    s = re.sub(r"\s+", " ", s, flags=re.UNICODE).strip()
    s = re.sub(
        r"^(the|a|an|o|os|as|um|uma|uns|umas|el|la|los|las|le|les)\s+",
        "",
        s,
        flags=re.IGNORECASE,
    )
    return s[:240]


def _backfill_works(apps, schema_editor):
    from django.utils.text import slugify

    Work = apps.get_model("employees", "Work")
    Manga = apps.get_model("employees", "Manga")

    # Slugs únicos: mantém contador em memória pra não bater no banco a
    # cada criação.
    used_slugs = set(Work.objects.values_list("slug", flat=True))

    def make_slug(title: str) -> str:
        base = slugify(title)[:200] or "work"
        candidate = base
        suffix = 2
        while candidate in used_slugs:
            candidate = f"{base}-{suffix}"[:255]
            suffix += 1
        used_slugs.add(candidate)
        return candidate

    cache: dict[str, int] = {}  # normalized_title -> work_id

    qs = Manga.objects.all().only("id", "title", "work_id").order_by("id")
    # Itera em lotes pra não estourar memória em catálogos grandes.
    batch_size = 500
    paginator_qs = qs
    total = paginator_qs.count()
    if total == 0:
        return

    for start in range(0, total, batch_size):
        chunk = list(paginator_qs[start : start + batch_size])
        for manga in chunk:
            norm = _normalize(manga.title or "")
            if not norm:
                continue
            work_id = cache.get(norm)
            if work_id is None:
                # Try DB (caso outra entrada anterior da mesma chunk tenha
                # criado mas o cache foi miss por race) — pula via DB.
                existing = Work.objects.filter(normalized_title=norm).first()
                if existing is None:
                    existing = Work.objects.create(
                        normalized_title=norm,
                        canonical_title=(manga.title or "").strip()[:255]
                        or "Untitled",
                        slug=make_slug(manga.title or "untitled"),
                    )
                work_id = existing.id
                cache[norm] = work_id
            if manga.work_id != work_id:
                Manga.objects.filter(id=manga.id).update(work_id=work_id)


def _reverse_noop(apps, schema_editor):
    # Reversa: o drop do work_id e da tabela Work fazem o trabalho.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0009_chapter_published_at"),
    ]

    operations = [
        migrations.CreateModel(
            name="Work",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("canonical_title", models.CharField(max_length=255)),
                (
                    "normalized_title",
                    models.CharField(db_index=True, max_length=255, unique=True),
                ),
                ("slug", models.SlugField(max_length=255, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["canonical_title"]},
        ),
        migrations.AddField(
            model_name="manga",
            name="work",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="mangas",
                to="employees.work",
            ),
        ),
        migrations.RunPython(_backfill_works, _reverse_noop),
    ]
