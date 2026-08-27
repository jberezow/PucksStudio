import type { SelectHTMLAttributes } from "react";

type FilterSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
};

export function FilterSelect({ label, children, ...selectProps }: FilterSelectProps) {
  return (
    <label>
      <span>{label}</span>
      <select {...selectProps}>{children}</select>
    </label>
  );
}
