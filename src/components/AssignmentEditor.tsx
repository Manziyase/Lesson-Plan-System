"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { useI18n } from "@/lib/i18n-client";

export type AssignmentDraft = {
  classId: string;
  className: string;
  subjectIds: string[];
};

type SubjectOption = { id: string; name: string };
type ClassOption = { id: string; name: string };

type Props = {
  classes: ClassOption[];
  subjects: SubjectOption[];
  value: AssignmentDraft[];
  onChange: (next: AssignmentDraft[]) => void;
  disabled?: boolean;
};

/** Searchable, chip-based subject selector for one class card. */
function ClassSubjectPicker({
  className,
  subjects,
  selected,
  disabled,
  onChange,
}: {
  className: string;
  subjects: SubjectOption[];
  selected: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedSubjects = subjects.filter((s) => selectedSet.has(s.id));
  const filtered = subjects.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="subject-picker">
      <div className="subject-picker__selected" aria-live="polite">
        {selectedSubjects.length ? (
          selectedSubjects.map((s) => (
            <button
              key={s.id}
              type="button"
              className="subject-chip subject-chip--selected"
              onClick={() => toggle(s.id)}
              disabled={disabled}
              aria-label={t("Remove {name} from {class}", { name: s.name, class: className })}
            >
              <span>{s.name}</span>
              <Icon name="x" size={12} />
            </button>
          ))
        ) : (
          <span className="subject-picker__empty">{t("No subjects selected for this class yet.")}</span>
        )}
      </div>

      <div className="subject-picker__search">
        <Icon name="search" size={15} />
        <input
          type="search"
          value={query}
          placeholder={t("Search subjects…")}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          aria-label={t("Search subjects for {class}", { class: className })}
        />
        {query ? (
          <button type="button" className="subject-picker__clear" onClick={() => setQuery("")} aria-label={t("Clear search")}>
            <Icon name="x" size={13} />
          </button>
        ) : null}
      </div>

      <div className="subject-picker__options" role="group" aria-label={t("Available subjects for {class}", { class: className })}>
        {subjects.length === 0 ? (
          <span className="subject-picker__empty">
            {t("No subjects have been added by the administrator yet.")}
          </span>
        ) : filtered.length === 0 ? (
          <span className="subject-picker__empty">{t("No subjects match your search.")}</span>
        ) : (
          filtered.map((s) => {
            const checked = selectedSet.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className={"subject-option" + (checked ? " subject-option--checked" : "")}
                aria-pressed={checked}
                onClick={() => toggle(s.id)}
                disabled={disabled}
              >
                <span className="subject-option__box" aria-hidden="true">
                  {checked ? <Icon name="check" size={12} /> : null}
                </span>
                <span>{s.name}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Class-by-class teacher assignment editor.
 * Each class card owns its own subject list, so SRE in P1 and SET in P3 are
 * stored as two separate assignments instead of a cross product.
 */
export default function AssignmentEditor({ classes, subjects, value, onChange, disabled }: Props) {
  const { t } = useI18n();
  const selectedClassIds = new Set(value.map((v) => v.classId));

  function toggleClass(cls: ClassOption) {
    if (selectedClassIds.has(cls.id)) {
      onChange(value.filter((v) => v.classId !== cls.id));
    } else {
      onChange([...value, { classId: cls.id, className: cls.name, subjectIds: [] }]);
    }
  }

  function setSubjects(classId: string, subjectIds: string[]) {
    onChange(value.map((v) => (v.classId === classId ? { ...v, subjectIds } : v)));
  }

  return (
    <div className="assignment-editor">
      <div className="assignment-editor__classes">
        <div className="assignment-editor__label">{t("Classes this teacher covers")}</div>
        <div className="assignment-editor__class-chips">
          {classes.length === 0 ? (
            <span className="subject-picker__empty">{t("No classes are configured for this school yet.")}</span>
          ) : (
            classes.map((cls) => {
              const checked = selectedClassIds.has(cls.id);
              return (
                <button
                  key={cls.id}
                  type="button"
                  className={"class-chip" + (checked ? " class-chip--selected" : "")}
                  aria-pressed={checked}
                  onClick={() => toggleClass(cls)}
                  disabled={disabled}
                >
                  <span className="subject-option__box" aria-hidden="true">
                    {checked ? <Icon name="check" size={12} /> : null}
                  </span>
                  {cls.name}
                </button>
              );
            })
          )}
        </div>
        <p className="field-hint">
          {t("Select each class, then choose the subjects this teacher teaches in that class.")}
        </p>
      </div>

      {value.length === 0 ? (
        <div className="assignment-editor__empty">
          <Icon name="users" size={20} />
          <span>{t("No classes assigned yet. Pick one or more classes above.")}</span>
        </div>
      ) : (
        <div className="assignment-cards">
          {value.map((assignment) => (
            <section key={assignment.classId} className="assignment-card">
              <header className="assignment-card__head">
                <div>
                  <span className="assignment-card__eyebrow">{t("Class")}</span>
                  <h4>{assignment.className}</h4>
                </div>
                <div className="assignment-card__actions">
                  <span className="assignment-card__count">
                    {t("{n} subject(s)", { n: assignment.subjectIds.length })}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => toggleClass({ id: assignment.classId, name: assignment.className })}
                    disabled={disabled}
                    title={t("Remove {class}", { class: assignment.className })}
                    aria-label={t("Remove {class}", { class: assignment.className })}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </header>
              <ClassSubjectPicker
                className={assignment.className}
                subjects={subjects}
                selected={assignment.subjectIds}
                disabled={disabled}
                onChange={(next) => setSubjects(assignment.classId, next)}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
