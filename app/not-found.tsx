import Link from "next/link";

import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <p>404</p>
      <h1>Thread not found</h1>
      <span>This thread does not exist or has been deleted.</span>
      <Link href="/">Start a new comparison</Link>
    </main>
  );
}
