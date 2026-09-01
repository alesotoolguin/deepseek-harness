/**
 * Advanced per-model fields shared by the curated catalog editors: input
 * modalities as toggle chips and reasoning levels as free tags. Both editors
 * (DeepSeek/opencode-go via DeepSeekModelsEditor, pi-ai via ModelListEditor)
 * write the same settings fields, so the controls live here once.
 */

import type { ReactNode } from 'react'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

/** A row's string-array field, or `undefined` when unset or not an array of strings. */
export function stringListOf(model: Record<string, unknown>, key: string): string[] | undefined {
  const value = model[key]
  return Array.isArray(value) && value.every(entry => typeof entry === 'string')
    ? value
    : undefined
}

/** The harness's merge-extensible modality vocabulary; stored values outside it join as extra chips. */
export const MODALITY_CHOICES: readonly string[] = ['text', 'image']

/** Chips offered for a row: the known vocabulary plus any stored values outside it. */
export function modalityChoices(value: string[] | undefined): string[] {
  const present = value ?? []
  return [...MODALITY_CHOICES, ...present.filter(entry => !MODALITY_CHOICES.includes(entry))]
}

/** The reasoning levels of one row, or the empty list when unset. */
export function reasoningOf(model: Record<string, unknown>): string[] {
  return stringListOf(model, 'reasoning') ?? []
}

/** Props of {@link ModalityChips}. */
export interface ModalityChipsProps {
  /** Stored modalities, or `undefined` while the field is unset. */
  value: string[] | undefined
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Disable every chip. */
  disabled: boolean
  /** Write the next field value; `undefined` drops the field. */
  onChange: (next: string[] | undefined) => void
}

/** Toggle chips over the modality vocabulary; turning the last one off drops the field. */
export function ModalityChips({ value, t, disabled, onChange }: ModalityChipsProps): ReactNode {
  return (
    <div className={styles['chipGroup']}>
      {modalityChoices(value).map((modality) => {
        const active = (value ?? []).includes(modality)
        return (
          <button
            key={modality}
            type="button"
            className={`${styles['chip']}${active ? ` ${styles['chipActive']}` : ''}`}
            aria-pressed={active}
            aria-label={`${t('inputModalities')} ${modality}`}
            disabled={disabled}
            onClick={() => {
              const current = value ?? []
              const next = current.includes(modality)
                ? current.filter(entry => entry !== modality)
                : [...current, modality]
              onChange(next.length === 0 ? undefined : next)
            }}
          >
            {modality}
          </button>
        )
      })}
    </div>
  )
}

/** Props of {@link ReasoningTags}. */
export interface ReasoningTagsProps {
  /** Stored levels, or `undefined` while the field is unset. */
  value: string[] | undefined
  /** The row's pending tag text, held by the owner so removals can re-key it. */
  draft: string
  /** Replace the pending text; an empty string clears it. */
  onDraftChange: (text: string) => void
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Disable every control. */
  disabled: boolean
  /** Commit the pending draft. */
  onCommit: () => void
  /** Remove one stored level. */
  onRemove: (tag: string) => void
  /** Input aria-label, e.g. "Reasoning levels 1". */
  label: string
}

/** Free-tag editor for one row's reasoning levels; Enter or comma commits a draft. */
export function ReasoningTags({
  value, draft, onDraftChange, t, disabled, onCommit, onRemove, label,
}: ReasoningTagsProps): ReactNode {
  const tags = value ?? []
  return (
    <div className={styles['tagGroup']}>
      {tags.map(tag => (
        <span key={tag} className={styles['tag']}>
          {tag}
          <button
            type="button"
            className={styles['tagRemove']}
            aria-label={`${t('removeReasoningLevel')} ${tag}`}
            disabled={disabled}
            onClick={() => { onRemove(tag) }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className={styles['tagInput']}
        type="text"
        value={draft}
        placeholder={t('reasoningPlaceholder')}
        aria-label={label}
        disabled={disabled}
        onChange={(event) => { onDraftChange(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ',') return
          event.preventDefault()
          onCommit()
        }}
        onBlur={() => { onDraftChange('') }}
      />
    </div>
  )
}
