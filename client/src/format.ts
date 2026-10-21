// Turns the codes and numbers sent by the server into text in the current language.
import type { TFunction } from 'i18next';
import { FAILURE_REASONS, type Failure, type FailureReason, type Issue, type ScanFailure } from '@qa/shared';
import { ApiRequestError } from './api.ts';

/** How many items of a list to show before "…and N more". */
export const LIST_LIMIT = 5;

const API_ERROR_CODES = [
  'invalidUrl',
  'privateAddress',
  'scanNotFound',
  'notFound',
  'notCancellable',
  'unauthorized',
  'wrongPassword',
  'tooManyAttempts',
  'tooManyScans',
] as const;

export function formatDuration(ms: number, t: TFunction): string {
  const total = Math.round(ms / 1000);
  return total < 60
    ? t('duration.seconds', { seconds: total })
    : t('duration.minutes', { minutes: Math.floor(total / 60), seconds: total % 60 });
}

export function formatDate(iso: string, language: string): string {
  return new Date(iso).toLocaleString(language, { dateStyle: 'long', timeStyle: 'short' });
}

export function failureText(failure: Failure, t: TFunction): string {
  return t(`errors.${failure.reason}`, {
    status: failure.status,
    seconds: failure.seconds,
    message: failure.message ?? '',
  });
}

export function scanFailureText(failure: ScanFailure, t: TFunction): string {
  const reason = failureText(failure, t);
  return failure.url ? t('scanError.startPage', { url: failure.url, reason }) : t('scanError.unexpected', { reason });
}

/** List params the server may send; each has a heading in "lists.<name>". */
export const ISSUE_LISTS = ['foundOn', 'pages', 'images', 'elements', 'errors', 'resources', 'snippets', 'urls', 'items', 'trackers', 'tags', 'nodes', 'cookies'] as const;

/**
 * Interpolation values for an issue's texts: its scalar params, plus "reasonText"
 * (the failure reason as a sentence) when the issue comes from a failed request.
 */
export function issueValues(issue: Issue, t: TFunction): Record<string, string | number | boolean | null> {
  const values: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(issue.params)) {
    if (!Array.isArray(value)) values[key] = value;
  }
  const { reason, status, seconds, message } = issue.params;
  if (typeof reason === 'string' && (FAILURE_REASONS as readonly string[]).includes(reason)) {
    values.reasonText = failureText(
      {
        reason: reason as FailureReason,
        status: typeof status === 'number' ? status : undefined,
        seconds: typeof seconds === 'number' ? seconds : undefined,
        message: typeof message === 'string' ? message : undefined,
      },
      t,
    );
  }
  return values;
}

export function apiErrorText(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiRequestError) || error.status === null) return t('api.network');
  const known = API_ERROR_CODES.find((code) => code === error.code);
  if (known) return t(`api.${known}`);
  // Fastify's own errors (e.g. validation) only come with an English message.
  return error.message || t('api.httpError', { status: error.status });
}
