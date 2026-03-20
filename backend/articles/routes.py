from flask import Blueprint, request, jsonify, send_file
from extensions import db
from models import Article, Tag, ArticleHistory, User
from utils import get_current_user, login_required, role_required, perm_required, slugify, unique_slug, can_edit, can_publish, has_permission
from datetime import datetime
from sqlalchemy import or_

articles_bp = Blueprint('articles', __name__)

@articles_bp.route('', methods=['GET'])
@login_required
def list_articles():
    user = get_current_user()
    q = Article.query

    # Check view_drafts permission from DB
    if not has_permission(user, 'view_drafts'):
        q = q.filter_by(status='published')

    # Filter by visibility - admin sees all, others see only their role's articles
    if user.role != 'admin':
        from sqlalchemy import or_
        q = q.filter(
            or_(
                Article.visibility == 'all',
                Article.visibility == None,
                Article.visibility.like(f'%{user.role}%')
            )
        )

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
    articles = Article.query.filter_by(status='published').order_by(Article.updated_at.desc()).limit(5).all()
    return jsonify([a.to_dict() for a in articles])

@articles_bp.route('/popular', methods=['GET'])
@login_required
def popular_articles():
    articles = Article.query.filter_by(status='published').order_by(Article.view_count.desc()).limit(5).all()
    return jsonify([a.to_dict() for a in articles])

@articles_bp.route('/<int:article_id>', methods=['GET'])
@login_required
def get_article(article_id):
    user = get_current_user()
    article = Article.query.get_or_404(article_id)
    if article.status != 'published' and user.role == 'viewer':
        return jsonify({'error': 'Not found'}), 404
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
    if article.status != 'published' and user.role == 'viewer':
        return jsonify({'error': 'Not found'}), 404
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
    slug = unique_slug(slugify(data['title']), Article)
    article = Article(
        title=data['title'], slug=slug,
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
    db.session.flush()
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
    change_summary = data.get('change_summary', 'Updated')

    for f in ['title', 'content', 'excerpt', 'content_type', 'category_id', 'is_pinned']:
        if f in data:
            setattr(article, f, data[f])

    if 'status' in data:
        if data['status'] == 'published' and not has_permission(user, 'publish_articles'):
            return jsonify({'error': 'You do not have permission to publish articles'}), 403
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
    filename = f"{article.defect_id if hasattr(article, 'defect_id') else safe_title}.pdf"
    filename = f"{safe_title}.pdf"
    return send_file(
        buffer,
        as_attachment=True,
        download_name=filename,
        mimetype='application/pdf'
    )


@articles_bp.route('/<int:article_id>/react', methods=['POST'])
@login_required
def react_article(article_id):
    article = Article.query.get_or_404(article_id)
    data = request.get_json()
    reaction = data.get('reaction')
    if reaction not in ('yes', 'no'):
        return jsonify({'error': 'Invalid reaction'}), 400
    if reaction == 'yes':
        article.reaction_yes = (article.reaction_yes or 0) + 1
    else:
        article.reaction_no = (article.reaction_no or 0) + 1
    db.session.commit()
    return jsonify(article._get_reactions())

# Simple in-memory lock store (resets on server restart - sufficient for small teams)
_article_locks = {}

@articles_bp.route('/<int:article_id>/lock', methods=['POST'])
@login_required
def acquire_lock(article_id):
    from datetime import datetime
    user = get_current_user()
    existing = _article_locks.get(article_id)
    if existing and existing['user_id'] != user.id:
        # Check if lock is stale (> 2 minutes)
        age = (datetime.utcnow() - existing['acquired_at']).total_seconds()
        if age < 120:
            return jsonify({'locked': True, 'locked_by': existing['user_name']})
    _article_locks[article_id] = {
        'user_id': user.id, 'user_name': user.name,
        'acquired_at': datetime.utcnow()
    }
    return jsonify({'locked': False})

@articles_bp.route('/<int:article_id>/lock', methods=['DELETE'])
@login_required
def release_lock(article_id):
    user = get_current_user()
    lock = _article_locks.get(article_id)
    if lock and lock['user_id'] == user.id:
        del _article_locks[article_id]
    return jsonify({'message': 'Released'})

@articles_bp.route('/<int:article_id>/lock-status', methods=['GET'])
@login_required
def lock_status(article_id):
    from datetime import datetime
    lock = _article_locks.get(article_id)
    if not lock:
        return jsonify({'locked': False, 'locked_by': None})
    age = (datetime.utcnow() - lock['acquired_at']).total_seconds()
    if age > 120:
        del _article_locks[article_id]
        return jsonify({'locked': False, 'locked_by': None})
    from models import User
    locked_user = User.query.get(lock['user_id'])
    return jsonify({'locked': True, 'locked_by': locked_user.to_dict() if locked_user else None})


@articles_bp.route('/needs-review', methods=['GET'])
@login_required
def needs_review():
    try:
        from datetime import datetime
        user = get_current_user()
        q = Article.query.filter_by(status='published').filter(
            Article.review_due != None,
            Article.review_due <= datetime.utcnow()
        )
        if user.role != 'admin':
            q = q.filter(
                db.or_(Article.visibility == 'all', Article.visibility.like(f'%{user.role}%'))
            )
        articles = q.order_by(Article.review_due.asc()).all()
        return jsonify([a.to_dict() for a in articles])
    except Exception:
        return jsonify([])

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

