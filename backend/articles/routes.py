from flask import Blueprint, request, jsonify, send_file
from extensions import db
from models import Article, Tag, ArticleHistory, User, ArticleRoleAccess, ArticleLock
from utils import get_current_user, login_required, role_required, perm_required, slugify, unique_slug, can_edit, can_publish, has_permission, get_role_category_ids, expand_category_ids
from datetime import datetime, timedelta
from sqlalchemy import or_, exists as sa_exists

articles_bp = Blueprint('articles', __name__)


LOCK_TTL_SECONDS = 120  # Article edit lock lifetime


def _apply_visibility_filter(q, user):
    """Apply article-level visibility + category-level access filters for the given user.
    Uses EXISTS subqueries against article_role_access for exact, indexed matching.
    Admins bypass all filters."""
    if user.role == 'admin':
        return q

    user_role = user.role_slug or user.role

    # Articles with NO rows in article_role_access are visible to everyone.
    # Articles WITH rows are visible only to roles listed there.
    has_restrictions = sa_exists().where(ArticleRoleAccess.article_id == Article.id)
    user_is_allowed  = sa_exists().where(
        (ArticleRoleAccess.article_id == Article.id) &
        (ArticleRoleAccess.role_slug  == user_role)
    )
    q = q.filter(~has_restrictions | user_is_allowed)

    # Category-level access (role_category_access table)
    allowed_cat_ids = get_role_category_ids(user)
    if allowed_cat_ids is not None:
        effective_cat_ids = expand_category_ids(allowed_cat_ids)
        q = q.filter(
            or_(Article.category_id.is_(None), Article.category_id.in_(effective_cat_ids))
        )

    return q


def _user_can_access_article(article, user):
    """Return True if the user may access this specific article.
    Queries article_role_access directly — exact match, no string parsing."""
    if user.role == 'admin':
        return True
    user_role = user.role_slug or user.role

    # Count restrictions; if none exist the article is open to all.
    restriction_count = ArticleRoleAccess.query.filter_by(article_id=article.id).count()
    if restriction_count > 0:
        allowed = ArticleRoleAccess.query.filter_by(
            article_id=article.id, role_slug=user_role
        ).first()
        if not allowed:
            return False

    # Category-level access check
    allowed_cat_ids = get_role_category_ids(user)
    if allowed_cat_ids is not None:
        effective_cat_ids = expand_category_ids(allowed_cat_ids)
        if article.category_id is not None and article.category_id not in effective_cat_ids:
            return False

    return True


def _save_history(article, user, change_summary=''):
    from models import ArticleHistory
    history = ArticleHistory(
        article_id=article.id,
        editor_id=user.id,
        content_snapshot=article.content,
        title_snapshot=article.title,
        change_summary=change_summary,
        version=article.version or 1
    )
    db.session.add(history)

@articles_bp.route('', methods=['GET'])
@login_required
def list_articles():
    user = get_current_user()
    from sqlalchemy.orm import joinedload
    q = Article.query.options(
        joinedload(Article.author),
        joinedload(Article.category),
        joinedload(Article.tags)
    )

    # Draft visibility:
    # - edit_any_article (admin-level): sees all drafts from everyone
    # - view_drafts only: sees published + own drafts only
    # - neither: published articles only
    if has_permission(user, 'edit_any_article'):
        pass  # no status filter — sees everything
    elif has_permission(user, 'view_drafts'):
        from sqlalchemy import and_
        q = q.filter(or_(
            Article.status == 'published',
            and_(Article.status.in_(['draft', 'archived']), Article.author_id == user.id)
        ))
    else:
        q = q.filter_by(status='published')

    # Apply role-based visibility + category access filtering
    q = _apply_visibility_filter(q, user)

    kw = request.args.get('q')
    if kw:
        q = q.filter(or_(Article.title.ilike(f'%{kw}%'), Article.content.ilike(f'%{kw}%'), Article.excerpt.ilike(f'%{kw}%')))

    cat_id = request.args.get('category_id')
    if cat_id:
        q = q.filter_by(category_id=int(cat_id))

    content_type = request.args.get('content_type')
    if content_type:
        q = q.filter_by(content_type=content_type)

    status = request.args.get('status')
    if status:
        q = q.filter_by(status=status)

    tag_name = request.args.get('tag')
    if tag_name:
        q = q.join(Article.tags).filter(Tag.name == tag_name)

    pinned_first = q.filter_by(is_pinned=True).order_by(Article.updated_at.desc()).all()
    rest = q.filter_by(is_pinned=False).order_by(Article.updated_at.desc()).all()

    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 20))
    all_articles = pinned_first + rest
    total = len(all_articles)
    start = (page - 1) * per_page
    paged = all_articles[start:start + per_page]

    return jsonify({
        'articles': [a.to_dict() for a in paged],
        'total': total,
        'pages': max(1, -(-total // per_page)),
        'page': page
    })

@articles_bp.route('/recent', methods=['GET'])
@login_required
def recent_articles():
    user = get_current_user()
    q = _apply_visibility_filter(Article.query.filter_by(status='published'), user)
    articles = q.order_by(Article.updated_at.desc()).limit(5).all()
    return jsonify([a.to_dict() for a in articles])

@articles_bp.route('/popular', methods=['GET'])
@login_required
def popular_articles():
    user = get_current_user()
    q = _apply_visibility_filter(Article.query.filter_by(status='published'), user)
    articles = q.order_by(Article.view_count.desc()).limit(5).all()
    return jsonify([a.to_dict() for a in articles])

@articles_bp.route('/<int:article_id>', methods=['GET'])
@login_required
def get_article(article_id):
    user = get_current_user()
    from sqlalchemy.orm import joinedload
    article = Article.query.options(
        joinedload(Article.author),
        joinedload(Article.category),
        joinedload(Article.tags)
    ).get_or_404(article_id)
    if article.status != 'published':
        can_view = (has_permission(user, 'edit_any_article') or
                    (has_permission(user, 'view_drafts') and article.author_id == user.id))
        if not can_view:
            return jsonify({'error': 'Not found'}), 404
    if not _user_can_access_article(article, user):
        return jsonify({'error': 'Not found'}), 404
    if article.status == 'published':
        article.view_count += 1
        db.session.commit()
    d = article.to_dict(include_content=True)
    d['comments'] = [c.to_dict() for c in article.comments.order_by(db.text('created_at')).all()]
    d['history'] = [h.to_dict() for h in article.history.order_by(ArticleHistory.version.desc()).limit(10).all()]
    return jsonify(d)

@articles_bp.route('/slug/<slug>', methods=['GET'])
@login_required
def get_article_by_slug(slug):
    user = get_current_user()
    article = Article.query.filter_by(slug=slug).first_or_404()
    if article.status != 'published':
        can_view = (has_permission(user, 'edit_any_article') or
                    (has_permission(user, 'view_drafts') and article.author_id == user.id))
        if not can_view:
            return jsonify({'error': 'Not found'}), 404
    if not _user_can_access_article(article, user):
        return jsonify({'error': 'Not found'}), 404
    if article.status == 'published':
        article.view_count += 1
        db.session.commit()
    d = article.to_dict(include_content=True)
    d['comments'] = [c.to_dict() for c in article.comments.order_by(db.text('created_at')).all()]
    d['history'] = [h.to_dict() for h in article.history.order_by(ArticleHistory.version.desc()).limit(10).all()]
    return jsonify(d)

@articles_bp.route('', methods=['POST'])
@perm_required('create_articles')
def create_article():
    user = get_current_user()
    data = request.get_json()
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Title is required'}), 400
    slug = unique_slug(slugify(title), Article)
    article = Article(
        title=title, slug=slug,
        content=data.get('content', ''),
        excerpt=data.get('excerpt', '')[:500] if data.get('excerpt') else '',
        content_type=data.get('content_type', 'article'),
        status=data.get('status', 'draft'),
        category_id=data.get('category_id'),
        author_id=user.id,
        is_pinned=data.get('is_pinned', False),
    )
    if article.status == 'published':
        article.published_at = datetime.utcnow()
    tag_ids = data.get('tag_ids', [])
    for tid in tag_ids:
        tag = Tag.query.get(tid)
        if tag:
            article.tags.append(tag)
    db.session.add(article)
    db.session.flush()  # gives article.id before commit

    # Visibility: write to article_role_access table (empty = visible to all)
    for role_slug in (data.get('visibility_roles') or []):
        db.session.add(ArticleRoleAccess(article_id=article.id, role_slug=role_slug))

    # Save initial history
    _save_history(article, user, 'Initial version')
    db.session.commit()
    return jsonify(article.to_dict(include_content=True)), 201

@articles_bp.route('/<int:article_id>', methods=['PUT'])
@login_required
def update_article(article_id):
    user = get_current_user()
    article = Article.query.get_or_404(article_id)
    if not has_permission(user, 'edit_any_article') and not has_permission(user, 'edit_own_articles'):
        return jsonify({'error': 'No permission to edit articles'}), 403
    if not has_permission(user, 'edit_any_article') and article.author_id != user.id:
        return jsonify({'error': 'You can only edit your own articles'}), 403

    data = request.get_json()

    # Check publish permission BEFORE mutating any fields (BUG-024)
    if 'status' in data and data['status'] == 'published' and not has_permission(user, 'publish_articles'):
        return jsonify({'error': 'You do not have permission to publish articles'}), 403

    change_summary = data.get('change_summary', 'Updated')

    if 'title' in data:
        new_title = (data['title'] or '').strip()
        if not new_title:
            return jsonify({'error': 'Title cannot be empty'}), 400
        article.title = new_title

    for f in ['content', 'excerpt', 'content_type', 'category_id', 'is_pinned']:
        if f in data:
            setattr(article, f, data[f])

    # Visibility: replace access rows atomically
    if 'visibility_roles' in data:
        ArticleRoleAccess.query.filter_by(article_id=article.id).delete()
        for role_slug in (data['visibility_roles'] or []):
            db.session.add(ArticleRoleAccess(article_id=article.id, role_slug=role_slug))

    # Review reminder - direct date
    if 'review_due_date' in data:
        try:
            date_str = data['review_due_date']
            if date_str:
                from datetime import datetime as dt
                article.review_due = dt.strptime(date_str, '%Y-%m-%d')
            else:
                article.review_due = None
        except (AttributeError, TypeError, ValueError):
            pass

    if 'status' in data:
        article.status = data['status']
        if data['status'] == 'published' and not article.published_at:
            article.published_at = datetime.utcnow()

    if 'tag_ids' in data:
        article.tags.clear()
        for tid in data['tag_ids']:
            tag = Tag.query.get(tid)
            if tag:
                article.tags.append(tag)

    article.last_edited_by_id = user.id
    article.version += 1
    article.updated_at = datetime.utcnow()
    _save_history(article, user, change_summary)
    db.session.commit()
    return jsonify(article.to_dict(include_content=True))

@articles_bp.route('/<int:article_id>', methods=['DELETE'])
@perm_required('delete_articles')
def delete_article(article_id):
    article = Article.query.get_or_404(article_id)
    db.session.delete(article)
    db.session.commit()
    return jsonify({'message': 'Deleted'})


@articles_bp.route('/<int:article_id>/pdf', methods=['GET'])
@login_required
def export_pdf(article_id):
    from articles.pdf import generate_article_pdf
    article = Article.query.get_or_404(article_id)
    user = get_current_user()
    if article.status != 'published' and user.role == 'viewer':
        return jsonify({'error': 'Not found'}), 404
    buffer = generate_article_pdf(article)
    safe_title = ''.join(c if c.isalnum() or c in ' -_' else '_' for c in article.title)[:60]
    filename = f"{safe_title}.pdf"
    return send_file(
        buffer,
        as_attachment=True,
        download_name=filename,
        mimetype='application/pdf'
    )



@articles_bp.route('/<int:article_id>/lock', methods=['POST'])
@login_required
def acquire_lock(article_id):
    """Acquire an edit lock for an article. DB-backed — safe across multiple workers."""
    user = get_current_user()
    now  = datetime.utcnow()
    existing = ArticleLock.query.filter_by(article_id=article_id).first()

    if existing:
        if existing.user_id != user.id and existing.expires_at > now:
            # Held by someone else and still valid
            holder = existing.user
            return jsonify({'locked': True, 'locked_by': holder.name if holder else 'Another user'})
        # Expired or it is our own lock — remove and re-acquire
        db.session.delete(existing)
        db.session.flush()

    lock = ArticleLock(
        article_id=article_id,
        user_id=user.id,
        locked_at=now,
        expires_at=now + timedelta(seconds=LOCK_TTL_SECONDS),
    )
    db.session.add(lock)
    db.session.commit()
    return jsonify({'locked': False})


@articles_bp.route('/<int:article_id>/lock', methods=['DELETE'])
@login_required
def release_lock(article_id):
    user = get_current_user()
    ArticleLock.query.filter_by(article_id=article_id, user_id=user.id).delete()
    db.session.commit()
    return jsonify({'message': 'Released'})


@articles_bp.route('/<int:article_id>/lock-status', methods=['GET'])
@login_required
def lock_status(article_id):
    now  = datetime.utcnow()
    lock = ArticleLock.query.filter_by(article_id=article_id).first()
    if not lock:
        return jsonify({'locked': False, 'locked_by': None})
    if lock.expires_at <= now:
        db.session.delete(lock)
        db.session.commit()
        return jsonify({'locked': False, 'locked_by': None})
    return jsonify({'locked': True, 'locked_by': lock.user.to_dict() if lock.user else None})



@articles_bp.route('/tags', methods=['POST'])
@login_required
def create_tag():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Name required'}), 400
    from models import Tag
    existing = Tag.query.filter_by(name=name).first()
    if existing:
        return jsonify({'id': existing.id, 'name': existing.name})
    tag = Tag(name=name)
    db.session.add(tag)
    db.session.commit()
    return jsonify({'id': tag.id, 'name': tag.name}), 201

@articles_bp.route('/tags', methods=['GET'])
@login_required
def get_tags():
    return jsonify([t.to_dict() for t in Tag.query.order_by(Tag.name).all()])

@articles_bp.route('/tags/<int:tag_id>', methods=['PUT'])
@login_required
def update_tag(tag_id):
    from utils import has_permission
    user = get_current_user()
    if not has_permission(user, 'manage_categories'):
        return jsonify({'error': 'No permission'}), 403
    tag = Tag.query.get_or_404(tag_id)
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Name required'}), 400
    existing = Tag.query.filter(Tag.name == name, Tag.id != tag_id).first()
    if existing:
        return jsonify({'error': 'Tag already exists'}), 400
    tag.name = name
    db.session.commit()
    return jsonify({'id': tag.id, 'name': tag.name})

@articles_bp.route('/tags/<int:tag_id>', methods=['DELETE'])
@login_required
def delete_tag(tag_id):
    from utils import has_permission
    user = get_current_user()
    if not has_permission(user, 'manage_categories'):
        return jsonify({'error': 'No permission'}), 403
    tag = Tag.query.get_or_404(tag_id)
    db.session.delete(tag)
    db.session.commit()
    return jsonify({'message': 'Tag deleted'})

