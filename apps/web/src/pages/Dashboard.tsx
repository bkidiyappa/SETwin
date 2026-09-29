import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { BrainLoader } from "../components/BrainLoader";

type ProductStats = {
  key: string;
  name: string;
  description: string;
  features: number;
  repositories: number;
  stories: number;
  implementedStories: number;
  storiesInReview: number;
  designs: number;
  designsApproved: number;
  code: number;
  codeApproved: number;
  tests: number;
  testsApproved: number;
  testsInReview: number;
};

export function DashboardPage() {
  const [products, setProducts] = useState<ProductStats[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setError("");
      try {
        const dashboard = await apiGet<{ products: ProductStats[] }>("/dashboard");
        if (cancelled) {
          return;
        }
        setProducts(dashboard.products);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    function onRefresh(): void {
      setReloadToken((value) => value + 1);
    }
    window.addEventListener("setwin-refresh", onRefresh);
    return () => window.removeEventListener("setwin-refresh", onRefresh);
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Products under development, and how far each one has moved through review.</p>
      {error ? <p className="error">{error}</p> : null}
      {loading ? <BrainLoader /> : null}
      {!loading && products.length === 0 ? (
        <div className="panel">
          <p>No products yet.</p>
          <Link to="/setup">Create one in Setup</Link>
        </div>
      ) : null}
      <div className="product-list">
        {products.map((row) => {
          const query = `?project=${encodeURIComponent(row.key)}`;
          const openStories = Math.max(0, row.stories - row.implementedStories);
          return (
            <article key={row.key} className="panel product-card">
              <header className="product-card-head">
                <div>
                  <h2>{row.name || row.key}</h2>
                  <p className="muted" style={{ margin: 0 }}>
                    {row.key}
                    {row.description ? ` · ${row.description}` : ""}
                  </p>
                </div>
                <div className="toolbar" style={{ margin: 0 }}>
                  <Link className="product-link" to={`/workspace${query}`}>
                    Workspace
                  </Link>
                  <Link className="product-link" to={`/twin${query}`}>
                    Explorer
                  </Link>
                </div>
              </header>
              <div className="product-stats">
                <Stat label="Features" value={String(row.features)} />
                <Stat label="Repositories" value={String(row.repositories)} />
                <Stat label="Stories" value={String(row.stories)} detail={`${openStories} still open`} />
                <Stat label="Implemented" value={`${row.implementedStories}/${row.stories || 0}`} detail="code and all tests approved" />
                <Stat label="In review" value={String(row.storiesInReview)} detail="stories" />
                <Stat label="Designs" value={`${row.designsApproved}/${row.designs}`} detail="approved" />
                <Stat label="Code" value={`${row.codeApproved}/${row.code}`} detail="approved" />
                <Stat label="Tests" value={String(row.tests)} detail={`${row.testsApproved} approved · ${row.testsInReview} in review`} />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="product-stat">
      <div className="muted">{label}</div>
      <div className="stat">{value}</div>
      {detail ? <div className="muted">{detail}</div> : null}
    </div>
  );
}
