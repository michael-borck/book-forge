/**
 * Book-related types for BookForge
 */

import type { CostEstimate, TokenUsage } from './provider';

// Book metadata and structure
export interface Book {
  id: string;
  title: string;
  description: string;
  author: string;
  language: string;
  genre: string;
  status: BookStatus;
  createdAt: Date;
  modifiedAt: Date;
  completedAt?: Date;
  
  // Generation details
  provider: string;
  model: string;
  generationParams: BookGenerationSettings;
  
  // Content structure
  chapters: BookChapter[];
  tableOfContents?: TableOfContentsEntry[];
  
  // Statistics
  totalTokens: number;
  totalCost: CostEstimate;
  wordCount: number;
  estimatedReadingTime: number; // in minutes
  
  // Export information
  lastExported?: {
    format: ExportFormat;
    timestamp: Date;
    filePath: string;
  };
}

export type BookStatus = 
  | 'draft'           // Initial state, structure created
  | 'generating'      // Currently being generated
  | 'paused'          // Generation paused by user
  | 'completed'       // All chapters generated
  | 'error'           // Generation failed
  | 'cancelled';      // User cancelled generation

export interface BookChapter {
  id: string;
  bookId: string;
  chapterNumber: number;
  title: string;
  content: string;
  summary?: string;
  
  // Generation metadata
  status: ChapterStatus;
  generatedAt?: Date;
  tokensUsed: number;
  wordCount: number;
  estimatedReadingTime: number;
  
  // Quality metrics
  qualityScore?: number;
  feedback?: string[];
}

export type ChapterStatus = 
  | 'pending'
  | 'generating'
  | 'completed'
  | 'error'
  | 'regenerating';

export interface TableOfContentsEntry {
  id: string;
  title: string;
  level: number; // 1 for chapters, 2 for sections, etc.
  pageNumber?: number;
  chapterId?: string;
  children?: TableOfContentsEntry[];
}

// Generation settings and preferences
export interface BookGenerationSettings {
  topic: string;
  style: WritingStyle;
  tone: WritingTone;
  length: BookLength;
  audience: TargetAudience;
  language: string;
  
  // Advanced options
  includeTableOfContents: boolean;
  includeIndex: boolean;
  includeGlossary: boolean;
  includeBibliography: boolean;
  customInstructions?: string;
  
  // Technical parameters
  temperature: number;
  maxTokensPerChapter: number;
  contextWindow: number;
}

export type WritingStyle = 
  | 'educational'
  | 'casual'
  | 'professional'
  | 'academic'
  | 'creative'
  | 'technical'
  | 'narrative'
  | 'instructional';

export type WritingTone = 
  | 'formal'
  | 'conversational'
  | 'humorous'
  | 'serious'
  | 'enthusiastic'
  | 'neutral'
  | 'authoritative'
  | 'friendly';

export type BookLength = 
  | 'short'     // 5-10 chapters, ~20-50 pages
  | 'medium'    // 10-15 chapters, ~50-150 pages
  | 'long'      // 15-25 chapters, ~150-300 pages
  | 'extended'  // 25+ chapters, ~300+ pages
  | 'custom';   // User-defined

export type TargetAudience = 
  | 'general'
  | 'technical'
  | 'academic'
  | 'business'
  | 'children'
  | 'young-adult'
  | 'professional'
  | 'beginner'
  | 'intermediate'
  | 'expert';

// Export and formatting types
export type ExportFormat = 
  | 'markdown'
  | 'html'
  | 'pdf'
  | 'docx'
  | 'epub'
  | 'txt';

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata: boolean;
  includeTableOfContents: boolean;
  includePageNumbers: boolean;
  includeCoverPage: boolean;
  
  // Format-specific options
  htmlOptions?: {
    theme: string;
    includeCSS: boolean;
    singleFile: boolean;
  };
  
  pdfOptions?: {
    pageSize: 'A4' | 'Letter' | 'Legal';
    margins: {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };
    fontSize: number;
    fontFamily: string;
  };
  
  markdownOptions?: {
    includeYAMLFrontMatter: boolean;
    includeHTMLTags: boolean;
    lineBreaks: 'LF' | 'CRLF';
  };
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  error?: string;
  fileSize?: number;
  exportedAt: Date;
  format: ExportFormat;
}

// Template system types
export interface BookTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  
  // Template configuration
  defaultSettings: Partial<BookGenerationSettings>;
  chapterStructure: ChapterTemplate[];
  
  // Metadata
  author: string;
  version: string;
  tags: string[];
  isBuiltIn: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Usage statistics
  useCount: number;
  rating?: number;
}

export type TemplateCategory = 
  | 'educational'
  | 'fiction'
  | 'non-fiction'
  | 'technical'
  | 'business'
  | 'self-help'
  | 'reference'
  | 'manual'
  | 'guide'
  | 'biography'
  | 'custom';

export interface ChapterTemplate {
  title: string;
  description?: string;
  prompt: string;
  estimatedLength: number; // in words
  order: number;
  isOptional: boolean;
  dependencies?: string[]; // IDs of chapters this depends on
}

// Search and filtering
export interface BookSearchCriteria {
  query?: string;
  status?: BookStatus[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  provider?: string[];
  tags?: string[];
  minWordCount?: number;
  maxWordCount?: number;
  sortBy: 'title' | 'createdAt' | 'modifiedAt' | 'wordCount' | 'status';
  sortOrder: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface BookSearchResult {
  books: Book[];
  totalCount: number;
  hasMore: boolean;
  facets?: {
    statuses: { status: BookStatus; count: number }[];
    providers: { provider: string; count: number }[];
    languages: { language: string; count: number }[];
  };
}