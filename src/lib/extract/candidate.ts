export type Method = "acroform" | "text" | "vision";
export type Candidate = {
  attribute: string;
  method: Method;
  /** Catalog-shaped value; a text-layer identifier carries hmac + last four, a model-read one last four only. */
  value: unknown;
  raw: string | null;
  source_block_ids: string[];
  quote: string | null;
  region: string | null;
  ambiguity: string | null;
  page: number | null;
  /** Vision only: the second independent read. */
  second_read?: unknown;
  mapped?: boolean;
  decode_error?: string | null;
};
export type ValidationMessage = { code: string; level: "error" | "warning" };
export type Validation = {
  attribute: string;
  messages: ValidationMessage[];
  /** 1 all pass, 0.5 warnings only, 0 material failure. */
  score: 1 | 0.5 | 0;
  /** Quote occurs in the cited block after whitespace normalization. Vision quotes are never verbatim. */
  exact: 0 | 1;
  locators_ok: boolean;
};
export type Verdict = {
  attribute: string;
  status: "supported" | "partially_supported" | "unsupported";
  corrected_value: unknown;
  contradiction: boolean;
  specificity: number;
  reason: string;
};
export type Scored = {
  attribute: string;
  method: Method;
  confidence: number;
  components: Record<string, number>;
  routing: "auto_accepted" | "review" | "blocked";
  reasons: string[];
};
