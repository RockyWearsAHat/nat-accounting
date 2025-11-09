import React from "react";
import styles from "./SpreadsheetPreview.module.css";

export interface SpreadsheetHighlight {
  columns?: number[];
  rows?: number[];
  cells?: Array<{ row: number; column: number }>;
}

interface SheetPreviewRange {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

interface SheetPreviewMetadata {
  usedRange?: SheetPreviewRange;
  dropdowns?: Record<string, { options: string[]; source?: string }>;
}

export interface SpreadsheetPreviewProps {
  sheetName?: string;
  data?: string[][];
  maxRows?: number;
  maxColumns?: number;
  onCellClick?: (row: number, column: number) => void;
  onColumnClick?: (column: number) => void;
  onRowClick?: (row: number) => void;
  highlight?: SpreadsheetHighlight;
  activeMode?: "cell" | "column" | "row" | null;
  instructions?: string;
  metadata?: SheetPreviewMetadata;
}

const DEFAULT_MAX_ROWS = 60;
const DEFAULT_MAX_COLUMNS = 26;

function indexToColumnLetter(index: number): string {
  let dividend = index + 1;
  let columnLabel = "";
  while (dividend > 0) {
    const modulo = ((dividend - 1) % 26) + 1;
    columnLabel = String.fromCharCode(64 + modulo) + columnLabel;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return columnLabel;
}

function isHighlighted(index: number, values?: number[]): boolean {
  if (!values || !values.length) return false;
  return values.includes(index);
}

function isCellHighlighted(
  row: number,
  column: number,
  highlight?: SpreadsheetHighlight
): boolean {
  if (!highlight?.cells || !highlight.cells.length) return false;
  return highlight.cells.some((cell) => cell.row === row && cell.column === column);
}

const SpreadsheetPreview: React.FC<SpreadsheetPreviewProps> = ({
  sheetName,
  data = [],
  maxRows = DEFAULT_MAX_ROWS,
  maxColumns = DEFAULT_MAX_COLUMNS,
  onCellClick,
  onColumnClick,
  onRowClick,
  highlight,
  activeMode,
  instructions,
  metadata,
}) => {
  const rows = React.useMemo(() => {
    if (!data || !data.length) return [] as string[][];
    const limitedRows = data.slice(0, maxRows);
    return limitedRows.map((row) => {
      const padded = [...row];
      if (padded.length < maxColumns) {
        padded.length = maxColumns;
      }
      return padded.map((value) =>
        value == null ? "" : typeof value === "string" ? value : String(value)
      );
    });
  }, [data, maxRows, maxColumns]);

  const maxDetectedColumns = React.useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.length), 0),
    [rows]
  );

  const usedRange = React.useMemo(() => {
    if (metadata?.usedRange) {
      return metadata.usedRange;
    }
    return {
      startRow: 0,
      endRow: Math.max(rows.length - 1, 0),
      startColumn: 0,
      endColumn: Math.max(maxDetectedColumns - 1, 0),
    };
  }, [metadata, rows.length, maxDetectedColumns]);

  const rowIndices = React.useMemo(() => {
    const indices: number[] = [];
    for (
      let row = usedRange.startRow;
      row <= Math.min(usedRange.endRow, rows.length - 1) && indices.length < maxRows;
      row += 1
    ) {
      indices.push(row);
    }
    return indices.length ? indices : Array.from({ length: rows.length }, (_, index) => index).slice(0, maxRows);
  }, [usedRange, rows.length, maxRows]);

  const columnIndices = React.useMemo(() => {
    const endColumn = Math.min(usedRange.endColumn, maxDetectedColumns - 1, maxColumns - 1);
    const startColumn = Math.min(usedRange.startColumn, endColumn);
    const indices: number[] = [];
    for (let column = startColumn; column <= endColumn; column += 1) {
      indices.push(column);
    }
    if (!indices.length) {
      const limit = Math.min(maxDetectedColumns, maxColumns);
      for (let c = 0; c < limit; c += 1) {
        indices.push(c);
      }
    }
    return indices;
  }, [usedRange, maxDetectedColumns, maxColumns]);

  return (
    <div className={styles.previewContainer}>
      <div className={styles.previewHeader}>
        <div className={styles.sheetName}>{sheetName || "Sheet"}</div>
        {instructions && <div className={styles.instructions}>{instructions}</div>}
      </div>
      <div className={styles.tableWrapper}>
        {rowIndices.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.cornerCell} />
                {columnIndices.map((columnIndex) => {
                  const letter = indexToColumnLetter(columnIndex);
                  const active = activeMode === "column" && highlight?.columns?.includes(columnIndex);
                  const highlighted = isHighlighted(columnIndex, highlight?.columns);
                  return (
                    <th
                      key={letter}
                      className={`${styles.columnHeader} ${highlighted ? styles.highlighted : ""} ${active ? styles.active : ""}`}
                      onClick={() => onColumnClick?.(columnIndex)}
                    >
                      {letter}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rowIndices.map((rowIndex) => {
                const rowNumber = rowIndex + 1;
                const rowData = rows[rowIndex] ?? [];
                const highlightedRow = isHighlighted(rowIndex, highlight?.rows);
                const activeRow =
                  activeMode === "row" && highlight?.rows?.includes(rowIndex);
                return (
                  <tr key={rowNumber}>
                    <th
                      className={
                        `${styles.rowHeader} ${
                          highlightedRow ? styles.highlighted : ""
                        } ${activeRow ? styles.active : ""}`
                      }
                      onClick={() => onRowClick?.(rowIndex)}
                    >
                      {rowNumber}
                    </th>
                    {columnIndices.map((columnIndex) => {
                      const value = rowData[columnIndex] ?? "";
                      const highlightedCell = isCellHighlighted(
                        rowIndex,
                        columnIndex,
                        highlight
                      );
                      const cellActive =
                        activeMode === "cell" && highlightedCell;
                      const address = `${indexToColumnLetter(columnIndex)}${rowIndex + 1}`;
                      const dropdown = metadata?.dropdowns?.[address];
                      const dropdownTooltip = dropdown
                        ? dropdown.options.length
                          ? `Options:\n${dropdown.options.join("\n")}`
                          : dropdown.source
                          ? `Options from ${dropdown.source}`
                          : "Dropdown"
                        : undefined;
                      const previewOptions = dropdown?.options ?? [];
                      const previewCount = previewOptions.length > 0 ? Math.min(previewOptions.length, 3) : 0;
                      const optionsPreview = previewCount
                        ? previewOptions.slice(0, previewCount).join(" • ")
                        : dropdown?.source
                        ? dropdown.source.replace(/\$/g, "")
                        : "";
                      return (
                        <td
                          key={columnIndex}
                          className={
                            `${styles.cell} ${
                              highlightedCell ? styles.highlighted : ""
                            } ${cellActive ? styles.active : ""}`
                          }
                          onClick={() => onCellClick?.(rowIndex, columnIndex)}
                          title={dropdownTooltip}
                        >
                          <div
                            className={
                              dropdown
                                ? `${styles.cellContent} ${styles.cellContentDropdown}`
                                : styles.cellContent
                            }
                          >
                            <span className={styles.cellText}>{value}</span>
                            {dropdown ? (
                              <div className={styles.dropdownIndicator}>
                                <span className={styles.dropdownBadge}>Dropdown</span>
                                {optionsPreview ? (
                                  <span className={styles.dropdownOptions}>
                                    {optionsPreview}
                                    {previewOptions.length > previewCount
                                      ? ` +${previewOptions.length - previewCount} more`
                                      : ""}
                                  </span>
                                ) : null}
                                <span className={styles.dropdownCaret}>▾</span>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className={styles.emptyState}>
            Upload a workbook to preview sheet data.
          </div>
        )}
      </div>
    </div>
  );
};

export default SpreadsheetPreview;
