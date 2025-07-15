from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel


class ProposedNote(BaseModel):
    post_id: str
    note_text: str
    trustworthy_sources: bool = True


class MisleadingTag(str, Enum):
    factual_error = "factual_error"
    manipulated_media = "manipulated_media"
    outdated_information = "outdated_information"
    missing_important_context = "missing_important_context"
    disputed_claim_as_fact = "disputed_claim_as_fact"
    misinterpreted_satire = "misinterpreted_satire"
    other = "other"


class ProposedMisleadingNote(ProposedNote):
    misleading_tags: List[MisleadingTag]


class Media(BaseModel):
    media_key: str
    media_type: str
    url: Optional[str] = None
    preview_image_url: Optional[str] = None
    height: Optional[int] = None
    width: Optional[int] = None
    duration_ms: Optional[int] = None
    view_count: Optional[int] = None


class Post(BaseModel):
    post_id: str
    author_id: str
    created_at: datetime
    text: str
    media: List[Media]


class NoteResult(BaseModel):
    note: Optional[ProposedMisleadingNote] = None
    refusal: Optional[str] = None
    error: Optional[str] = None
    post: Optional[Post] = None
    images_summary: Optional[str] = None


class ContextPoint(BaseModel):
    """Represents a piece of missing context from a post"""
    description: str
    importance: int  # 1-5, where 5 is most important
    source_required: bool = True


class TrustedSource(BaseModel):
    """Represents a source with trustworthiness evaluation"""
    url: str
    trust_score: int  # 0-100
    trust_reason: str
    relevant_content: Optional[str] = None
    addresses_context: bool = False


class ResearchResult(BaseModel):
    """Results from the enhanced research pipeline"""
    post_id: str
    search_query: str
    search_results: str
    missing_context_points: List[ContextPoint]
    sources: List[TrustedSource]
    primary_source: Optional[TrustedSource] = None
    note_text: Optional[str] = None
