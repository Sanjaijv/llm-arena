"use client";

import { useMemo, useState } from "react";

import type { FreeModel } from "@/features/model-catalog/contract";

import styles from "./models-catalog.module.css";

const formatContext = (tokens: number | null): string => {
  if (tokens === null) {
    return "—";
  }
  return tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`
    : `${Math.round(tokens / 1_000)}K`;
};

export function ModelsCatalog({
  models,
}: Readonly<{ models: readonly FreeModel[] }>) {
  const [search, setSearch] = useState("");
  const visibleModels = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? models.filter(
          (model) =>
            model.name.toLocaleLowerCase().includes(query) ||
            model.id.toLocaleLowerCase().includes(query),
        )
      : models;
  }, [models, search]);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Model catalog</p>
          <h2>Browse every free model.</h2>
          <span>
            Live OpenRouter text models, sorted by largest context window.
          </span>
        </div>
        <strong>{models.length} available</strong>
      </header>

      <section className={styles.catalog} aria-labelledby="catalog-heading">
        <div className={styles.toolbar}>
          <label>
            <span className="sr-only">Search models</span>
            <input
              type="search"
              value={search}
              placeholder="Search models or providers…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <span>{visibleModels.length} results</span>
        </div>

        <div className={styles.table} role="table" aria-label="Free models">
          <div className={styles.tableHead} role="row">
            <span role="columnheader">Model</span>
            <span role="columnheader">Context</span>
            <span role="columnheader">Pricing</span>
          </div>
          {visibleModels.map((model) => (
            <div className={styles.row} role="row" key={model.id}>
              <span role="cell">
                <i aria-hidden="true" />
                <span>
                  <strong>{model.name}</strong>
                  <small>{model.id}</small>
                </span>
              </span>
              <span role="cell">{formatContext(model.contextLength)}</span>
              <span role="cell">
                <b>Free</b>
              </span>
            </div>
          ))}
          {visibleModels.length === 0 && (
            <p className={styles.empty}>No free models match that search.</p>
          )}
        </div>
      </section>
    </div>
  );
}
