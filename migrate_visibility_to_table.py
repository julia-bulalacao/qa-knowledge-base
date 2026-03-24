"""
migrate_visibility_to_table.py
─────────────────────────────
One-time migration: converts the legacy comma-separated `visibility` column on
the `article` table into rows in the new `article_role_access` table.

Run ONCE after deploying the updated backend that includes the ArticleRoleAccess
model. Safe to run again — it skips articles already migrated.

Usage:
    python migrate_visibility_to_table.py

The script reads DATABASE_URL from the environment (same as the app).
Falls back to the local SQLite dev database when DATABASE_URL is not set.
"""

import os
import sys

# ── Bootstrap Flask app context so we can use SQLAlchemy models ──────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app import create_app
from extensions import db
from models import Article, ArticleRoleAccess

app = create_app()

with app.app_context():
    # Ensure the new table exists (create_all is idempotent)
    db.create_all()

    articles = Article.query.all()
    migrated = 0
    skipped  = 0
    errors   = 0

    for article in articles:
        # Read legacy CSV from the raw column (may not be mapped in ORM)
        try:
            from sqlalchemy import text
            row = db.session.execute(
                text('SELECT visibility FROM article WHERE id = :id'),
                {'id': article.id}
            ).fetchone()
            csv_value = row[0] if row else None
        except Exception as e:
            print(f'  [WARN] Could not read visibility for article {article.id}: {e}')
            errors += 1
            continue

        # Skip articles that have no restriction or are already migrated
        if not csv_value or csv_value.strip() in ('', 'all'):
            skipped += 1
            continue

        # Skip if this article already has rows in the new table (idempotent)
        existing_count = ArticleRoleAccess.query.filter_by(article_id=article.id).count()
        if existing_count > 0:
            skipped += 1
            continue

        # Parse comma-separated role slugs and insert one row each
        role_slugs = [r.strip() for r in csv_value.split(',') if r.strip()]
        for slug in role_slugs:
            db.session.add(ArticleRoleAccess(article_id=article.id, role_slug=slug))

        print(f'  Migrated article {article.id:>4} "{article.title[:50]}" → roles: {role_slugs}')
        migrated += 1

    db.session.commit()

    print()
    print('─' * 60)
    print(f'Migration complete.')
    print(f'  Articles migrated : {migrated}')
    print(f'  Skipped (all/done): {skipped}')
    print(f'  Errors            : {errors}')
    print()
    print('The legacy `visibility` column is still present in the database.')
    print('It is no longer written to by the backend. You may drop it with:')
    print('  ALTER TABLE article DROP COLUMN visibility;')
    print('once you have confirmed everything is working correctly.')
