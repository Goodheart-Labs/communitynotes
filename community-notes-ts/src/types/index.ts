import { z } from 'zod';

// Media types
export const MediaSchema = z.object({
  media_key: z.string(),
  type: z.enum(['photo', 'video', 'animated_gif']),
  url: z.string().url().optional(),
  preview_image_url: z.string().url().optional(),
  height: z.number().optional(),
  width: z.number().optional(),
  duration_ms: z.number().optional(),
  view_count: z.number().optional()
});

export type Media = z.infer<typeof MediaSchema>;

// Post schema
export const PostSchema = z.object({
  id: z.string(),
  author_id: z.string(),
  created_at: z.string(), // ISO date string
  text: z.string(),
  media: z.array(MediaSchema).default([])
});

export type Post = z.infer<typeof PostSchema>;

// Misleading tags enum
export enum MisleadingTag {
  FactualError = 'factual_error',
  ManipulatedMedia = 'manipulated_media',
  OutdatedInformation = 'outdated_information',
  MissingImportantContext = 'missing_important_context',
  DisputedClaimAsFact = 'disputed_claim_as_fact',
  MisinterpretedSatire = 'misinterpreted_satire',
  Other = 'other'
}

// Note schemas
export const ProposedNoteSchema = z.object({
  post_id: z.string(),
  note_text: z.string().max(280),
  trustworthy_sources: z.boolean().default(true)
});

export type ProposedNote = z.infer<typeof ProposedNoteSchema>;

export const ProposedMisleadingNoteSchema = ProposedNoteSchema.extend({
  misleading_tags: z.array(z.nativeEnum(MisleadingTag))
});

export type ProposedMisleadingNote = z.infer<typeof ProposedMisleadingNoteSchema>;

// Note result schema
export const NoteResultSchema = z.object({
  note: ProposedMisleadingNoteSchema.optional(),
  refusal: z.string().optional(),
  error: z.string().optional(),
  post: PostSchema.optional(),
  images_summary: z.string().optional()
});

export type NoteResult = z.infer<typeof NoteResultSchema>;

// Research-related schemas
export const ContextPointSchema = z.object({
  description: z.string(),
  importance: z.number().min(1).max(5),
  source_required: z.boolean().default(true)
});

export type ContextPoint = z.infer<typeof ContextPointSchema>;

export const TrustedSourceSchema = z.object({
  url: z.string().url(),
  trust_score: z.number().min(0).max(100),
  trust_reason: z.string(),
  relevant_content: z.string().optional(),
  addresses_context: z.boolean().default(false)
});

export type TrustedSource = z.infer<typeof TrustedSourceSchema>;

export const ResearchResultSchema = z.object({
  post_id: z.string(),
  search_query: z.string(),
  search_results: z.string(),
  missing_context_points: z.array(ContextPointSchema),
  sources: z.array(TrustedSourceSchema),
  primary_source: TrustedSourceSchema.optional(),
  note_text: z.string().optional()
});

export type ResearchResult = z.infer<typeof ResearchResultSchema>;

// X API response schemas
export const XAPIPostResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    author_id: z.string(),
    created_at: z.string(),
    text: z.string(),
    attachments: z.object({
      media_keys: z.array(z.string())
    }).optional()
  })),
  includes: z.object({
    media: z.array(MediaSchema)
  }).optional()
});

export type XAPIPostResponse = z.infer<typeof XAPIPostResponseSchema>;

// Config schema
export const ConfigSchema = z.object({
  x_api_key: z.string(),
  x_api_key_secret: z.string(),
  x_access_token: z.string(),
  x_access_token_secret: z.string(),
  openrouter_api_key: z.string(),
  research_mode: z.enum(['grok', 'enhanced']).default('enhanced'),
  fetch_timeout: z.number().default(10000),
  max_sources_to_fetch: z.number().default(5),
  dry_run: z.boolean().default(false),
  max_posts: z.number().default(10),
  concurrency: z.number().default(1)
});

export type Config = z.infer<typeof ConfigSchema>;