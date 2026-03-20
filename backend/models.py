from extensions import db
from datetime import datetime

article_tags = db.Table('article_tags',
    db.Column('article_id', db.Integer, db.ForeignKey('article.id')),
    db.Column('tag_id', db.Integer, db.ForeignKey('tag.id'))
)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(50), nullable=False, default='viewer')
    role_slug = db.Column(db.String(50), db.ForeignKey('role.slug'), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    avatar_color = db.Column(db.String(7), default='#6366f1')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'email': self.email,
            'role': self.role, 'is_active': self.is_active,
            'avatar_color': self.avatar_color,
            'created_at': self.created_at.isoformat()
        }

class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    slug = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text)
    icon = db.Column(db.String(10), default='📁')
    color = db.Column(db.String(7), default='#6366f1')
    parent_id = db.Column(db.Integer, db.ForeignKey('category.id'), nullable=True)
    order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    children = db.relationship('Category', backref=db.backref('parent', remote_side=[id]), lazy='dynamic')
    articles = db.relationship('Article', backref='category', lazy='dynamic')

    def to_dict(self, include_children=False):
        d = {
            'id': self.id, 'name': self.name, 'slug': self.slug,
            'description': self.description, 'icon': self.icon,
            'color': self.color, 'parent_id': self.parent_id,
            'order': self.order,
            'article_count': self.articles.filter_by(status='published').count()
        }
        if include_children:
            d['children'] = [c.to_dict() for c in self.children.order_by(Category.order).all()]
        return d

class Article(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(300), nullable=False)
    slug = db.Column(db.String(300), unique=True, nullable=False)
    content = db.Column(db.Text)
    excerpt = db.Column(db.String(500))
    content_type = db.Column(db.String(30), default='article')
    # Types: sop, onboarding, bug_fix, article, procedure, guide
    status = db.Column(db.String(20), default='draft')  # draft, published, archived
    category_id = db.Column(db.Integer, db.ForeignKey('category.id'), nullable=True)
    author_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    last_edited_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    view_count = db.Column(db.Integer, default=0)
    is_pinned = db.Column(db.Boolean, default=False)
    version = db.Column(db.Integer, default=1)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = db.Column(db.DateTime)

    tags = db.relationship('Tag', secondary=article_tags, backref='articles')
    comments = db.relationship('Comment', backref='article', lazy='dynamic', cascade='all, delete-orphan')
    history = db.relationship('ArticleHistory', backref='article', lazy='dynamic', cascade='all, delete-orphan')
    author = db.relationship('User', foreign_keys=[author_id], backref='articles_authored')
    last_editor = db.relationship('User', foreign_keys=[last_edited_by_id])

    def _safe_get(self, attr, default=None):
        try:
            return getattr(self, attr)
        except AttributeError:
            return default

    def _needs_review(self):
        try:
            if not self.review_due:
                return False
            from datetime import datetime
            return datetime.utcnow() >= self.review_due
        except AttributeError:
            return False

    def _get_reactions(self):
        try:
            yes = self.reaction_yes or 0
            no = self.reaction_no or 0
        except AttributeError:
            yes, no = 0, 0
        return {'yes': yes, 'no': no, 'total': yes + no}

    @property
    def clean_excerpt(self):
        return self.excerpt or ''

    def to_dict(self, include_content=False):
        d = {
            'id': self.id, 'title': self.title, 'slug': self.slug,
            'excerpt': self.clean_excerpt, 'content_type': self.content_type,
            'status': self.status,
            'category': self.category.to_dict() if self.category else None,
            'author': self.author.to_dict() if self.author else None,
            'last_editor': self.last_editor.to_dict() if self.last_editor else None,
            'view_count': self.view_count, 'is_pinned': self.is_pinned,
            'version': self.version,
            'tags': [t.to_dict() for t in self.tags],
            'comment_count': self.comments.count(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'reactions': self._get_reactions(),
            'visibility': self._safe_get('visibility', 'all'),
            'review_due': self.review_due.isoformat() if self._safe_get('review_due') else None,
            'review_interval_days': self._safe_get('review_interval_days', 180),
            'needs_review': self._needs_review(),
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'published_at': self.published_at.isoformat() if self.published_at else None,
        }
        if include_content:
            d['content'] = self.content
        return d

class Tag(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    color = db.Column(db.String(7), default='#6366f1')

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'color': self.color}


class Role(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    slug = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.String(200))
    color = db.Column(db.String(7), default='#6366f1')
    is_system = db.Column(db.Boolean, default=False)  # system roles can't be deleted
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Permissions as boolean columns
    perm_create_articles = db.Column(db.Boolean, default=False)
    perm_edit_any_article = db.Column(db.Boolean, default=False)
    perm_edit_own_articles = db.Column(db.Boolean, default=False)
    perm_publish_articles = db.Column(db.Boolean, default=False)
    perm_delete_articles = db.Column(db.Boolean, default=False)
    perm_manage_categories = db.Column(db.Boolean, default=False)
    perm_manage_users = db.Column(db.Boolean, default=False)
    perm_export_pdf = db.Column(db.Boolean, default=True)
    perm_add_comments = db.Column(db.Boolean, default=False)
    perm_view_drafts = db.Column(db.Boolean, default=False)

    users = db.relationship('User', backref='role_obj', lazy='dynamic', foreign_keys='User.role_slug')

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'slug': self.slug,
            'description': self.description, 'color': self.color,
            'is_system': self.is_system,
            'created_at': self.created_at.isoformat(),
            'user_count': self.users.count(),
            'permissions': {
                'create_articles': self.perm_create_articles,
                'edit_any_article': self.perm_edit_any_article,
                'edit_own_articles': self.perm_edit_own_articles,
                'publish_articles': self.perm_publish_articles,
                'delete_articles': self.perm_delete_articles,
                'manage_categories': self.perm_manage_categories,
                'manage_users': self.perm_manage_users,
                'export_pdf': self.perm_export_pdf,
                'add_comments': self.perm_add_comments,
                'view_drafts': self.perm_view_drafts,
            }
        }

class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.Integer, db.ForeignKey('article.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    author = db.relationship('User', backref='wiki_comments')

    def to_dict(self):
        return {
            'id': self.id, 'article_id': self.article_id,
            'content': self.content,
            'author': self.author.to_dict() if self.author else None,
            'created_at': self.created_at.isoformat()
        }

class ArticleHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.Integer, db.ForeignKey('article.id'), nullable=False)
    editor_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    content_snapshot = db.Column(db.Text)
    title_snapshot = db.Column(db.String(300))
    version = db.Column(db.Integer)
    change_summary = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    editor = db.relationship('User')

    def to_dict(self):
        return {
            'id': self.id, 'version': self.version,
            'change_summary': self.change_summary,
            'editor': self.editor.to_dict() if self.editor else None,
            'created_at': self.created_at.isoformat()
        }

class SiteSettings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(50), unique=True, nullable=False)
    value = db.Column(db.Text)
    updated_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)

    @staticmethod
    def get(key, default=None):
        s = SiteSettings.query.filter_by(key=key).first()
        return s.value if s else default

    @staticmethod
    def set(key, value, user_id=None):
        from extensions import db
        s = SiteSettings.query.filter_by(key=key).first()
        if s:
            s.value = value
            s.updated_by_id = user_id
            s.updated_at = datetime.utcnow()
        else:
            s = SiteSettings(key=key, value=value, updated_by_id=user_id)
            db.session.add(s)
        db.session.commit()
        return s
