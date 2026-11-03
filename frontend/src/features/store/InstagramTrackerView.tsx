import { useMemo, useState, type FormEvent } from "react";
import {
  createId,
  localDateTime,
  tr,
  type InstagramMediaType,
  type InstagramPost,
  type InstagramPostStatus,
  type Product,
} from "./model";
import { useStore } from "./StoreContext";
import { Dialog, EmptyState, PageHeader, euro } from "./StoreUI";

type InstagramPostDraft = Omit<InstagramPost, "id" | "createdAt">;

const today = () => localDateTime(new Date()).slice(0, 10);

function emptyDraft(): InstagramPostDraft {
  return {
    caption: "",
    postUrl: "",
    mediaType: "post",
    status: "planned",
    postDate: today(),
    productIds: [],
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    profileVisits: 0,
    orders: 0,
    salesRevenue: 0,
  };
}

function PostDialog({ post, products, onClose }: {
  post: InstagramPost | null;
  products: Product[];
  onClose: () => void;
}) {
  const { data, commit } = useStore();
  const t = (sq: string, en: string) => tr(data.language, sq, en);
  const [draft, setDraft] = useState<InstagramPostDraft>(() => post
    ? {
      caption: post.caption,
      postUrl: post.postUrl,
      mediaType: post.mediaType,
      status: post.status,
      postDate: post.postDate,
      productIds: [...post.productIds],
      reach: post.reach,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      saves: post.saves,
      profileVisits: post.profileVisits,
      orders: post.orders,
      salesRevenue: post.salesRevenue,
    }
    : emptyDraft());
  const [error, setError] = useState("");

  const update = <K extends keyof InstagramPostDraft>(field: K, value: InstagramPostDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.caption.trim()) return setError(t("Shënoni përshkrimin e postimit.", "Enter a caption or internal post name."));
    if (!draft.postDate) return setError(t("Zgjidhni datën e postimit.", "Choose a post date."));
    const savedPost: InstagramPost = {
      ...draft,
      caption: draft.caption.trim(),
      postUrl: draft.postUrl.trim(),
      id: post?.id ?? createId(),
      createdAt: post?.createdAt ?? localDateTime(new Date()),
    };
    const saved = await commit((current) => ({
      ...current,
      instagramPosts: post
        ? current.instagramPosts.map((item) => item.id === post.id ? savedPost : item)
        : [savedPost, ...current.instagramPosts],
    }));
    if (!saved) return setError(t("Postimi nuk u ruajt. Kontrolloni lidhjen me serverin.", "The post could not be saved. Check your server connection."));
    onClose();
  };

  return <Dialog title={post ? t("Ndrysho postimin", "Edit Instagram post") : t("Regjistro postim", "Track an Instagram post")} onClose={onClose} wide>
    <form className="store-form" onSubmit={(event) => void submit(event)}>
      <div className="form-grid">
        <label className="control form-span"><span>{t("Përshkrimi / emri i postimit *", "Caption / post name *")}</span><textarea autoFocus className="input" rows={3} value={draft.caption} onChange={(event) => update("caption", event.target.value)} placeholder={t("p.sh. Fustani i ri i koleksionit veror", "e.g. New dress from the summer collection")} /></label>
        <label className="control"><span>{t("Lloji i përmbajtjes", "Content type")}</span><select className="input" value={draft.mediaType} onChange={(event) => update("mediaType", event.target.value as InstagramMediaType)}>
          <option value="post">{t("Postim", "Post")}</option><option value="reel">Reel</option><option value="story">Story</option>
        </select></label>
        <label className="control"><span>{t("Gjendja", "Status")}</span><select className="input" value={draft.status} onChange={(event) => update("status", event.target.value as InstagramPostStatus)}>
          <option value="planned">{t("Planifikuar", "Planned")}</option><option value="published">{t("Publikuar", "Published")}</option>
        </select></label>
        <label className="control"><span>{draft.status === "planned" ? t("Data e planifikuar", "Planned date") : t("Data e publikimit", "Published date")}</span><input className="input" type="date" required value={draft.postDate} onChange={(event) => update("postDate", event.target.value)} /></label>
        <label className="control"><span>{t("Lidhja e postimit (opsionale)", "Post URL (optional)")}</span><input className="input" type="url" value={draft.postUrl} onChange={(event) => update("postUrl", event.target.value)} placeholder="https://www.instagram.com/p/..." /></label>
      </div>
      <section className="selection-panel instagram-product-select">
        <div className="section-title"><div><strong>{t("Produktet e promovuara", "Featured products")}</strong><small>{t("Lidhni postimin me produktet në katalog.", "Link this post to products in your catalogue.")}</small></div><span className="soft-chip">{draft.productIds.length}</span></div>
        {products.length ? <div className="selection-list">{products.map((product) => <label className="selection-item" key={product.id}>
          <input type="checkbox" checked={draft.productIds.includes(product.id)} onChange={(event) => update("productIds", event.target.checked ? [...draft.productIds, product.id] : draft.productIds.filter((id) => id !== product.id))} />
          <span><strong>{product.name}</strong><small>{product.brand || product.category}</small></span>
          <b>{euro.format(product.retailPrice)}</b>
        </label>)}</div> : <p className="muted">{t("Shtoni produkte në katalog për t'i lidhur me postimet.", "Add products to the catalogue to link them to posts.")}</p>}
      </section>
      {draft.status === "published" && <section className="selection-panel instagram-metrics-form">
        <div className="section-title"><div><strong>{t("Statistikat e Instagram-it", "Instagram insights")}</strong><small>{t("Plotësojini manualisht nga Insights.", "Enter these manually from Instagram Insights.")}</small></div></div>
        <div className="form-grid">
          {([
            ["reach", t("Shtrirja", "Reach")],
            ["likes", t("Pëlqimet", "Likes")],
            ["comments", t("Komentet", "Comments")],
            ["shares", t("Shpërndarjet", "Shares")],
            ["saves", t("Ruajtjet", "Saves")],
            ["profileVisits", t("Vizitat në profil", "Profile visits")],
            ["orders", t("Porositë e atribuuara", "Attributed orders")],
            ["salesRevenue", t("Shitjet e atribuuara (€)", "Attributed sales (€)")],
          ] as const).map(([field, label]) => <label className="control" key={field}>
            <span>{label}</span>
            <input className="input" type="number" min="0" step={field === "salesRevenue" ? "0.01" : "1"} value={draft[field]} onChange={(event) => update(field, Number(event.target.value))} />
          </label>)}
        </div>
      </section>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button button-light" onClick={onClose}>{t("Anulo", "Cancel")}</button><button type="submit" className="button button-dark">{post ? t("Ruaj ndryshimet", "Save changes") : t("Ruaj postimin", "Save post")}</button></div>
    </form>
  </Dialog>;
}

export function InstagramTrackerView() {
  const { data, commit } = useStore();
  const t = (sq: string, en: string) => tr(data.language, sq, en);
  const [showForm, setShowForm] = useState(false);
  const [editingPost, setEditingPost] = useState<InstagramPost | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | InstagramPostStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | InstagramMediaType>("all");
  const productById = useMemo(() => new Map(data.products.map((product) => [product.id, product])), [data.products]);
  const visiblePosts = useMemo(() => data.instagramPosts
    .filter((post) => {
      const productNames = post.productIds.map((id) => productById.get(id)?.name ?? "").join(" ");
      const matchesQuery = `${post.caption} ${post.postUrl} ${productNames}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
      return matchesQuery && (statusFilter === "all" || post.status === statusFilter) && (typeFilter === "all" || post.mediaType === typeFilter);
    })
    .sort((a, b) => b.postDate.localeCompare(a.postDate)), [data.instagramPosts, productById, query, statusFilter, typeFilter]);
  const publishedPosts = data.instagramPosts.filter((post) => post.status === "published");
  const totalReach = publishedPosts.reduce((sum, post) => sum + post.reach, 0);
  const totalEngagement = publishedPosts.reduce((sum, post) => sum + post.likes + post.comments + post.shares + post.saves, 0);
  const totalOrders = publishedPosts.reduce((sum, post) => sum + post.orders, 0);
  const attributedSales = publishedPosts.reduce((sum, post) => sum + post.salesRevenue, 0);

  const deletePost = async (post: InstagramPost) => {
    if (!window.confirm(t("Të fshihet ky regjistrim i Instagram-it?", "Delete this Instagram tracking record?"))) return;
    await commit((current) => ({ ...current, instagramPosts: current.instagramPosts.filter((item) => item.id !== post.id) }));
  };

  const openNewPost = () => {
    setEditingPost(null);
    setShowForm(true);
  };

  return <div className="view">
    <PageHeader eyebrow={t("MARKETING & MATJE", "MARKETING & INSIGHTS")} title={t("Gjurmuesi i Instagram-it", "Instagram post tracker")} description={t("Regjistroni postimet dhe ndiqni manualisht performancën e tyre dhe shitjet.", "Log posts and manually track their performance and attributed sales.")}
      action={<button className="button button-dark" onClick={openNewPost}>+ {t("Shto postim", "Track a post")}</button>} />
    <section className="instagram-summary">
      <article className="instagram-stat"><span>{t("POSTIME TË PUBLIKUARA", "PUBLISHED POSTS")}</span><strong>{publishedPosts.length}</strong><small>{data.instagramPosts.length - publishedPosts.length} {t("të planifikuara", "planned")}</small></article>
      <article className="instagram-stat"><span>{t("SHTIRRJA GJITHSEJ", "TOTAL REACH")}</span><strong>{totalReach.toLocaleString(data.language === "sq" ? "sq-AL" : "en-GB")}</strong><small>{t("nga postimet e publikuara", "across published posts")}</small></article>
      <article className="instagram-stat"><span>{t("NDËRVEPRIMET", "ENGAGEMENT")}</span><strong>{totalEngagement.toLocaleString(data.language === "sq" ? "sq-AL" : "en-GB")}</strong><small>{t("pëlqime, komente, shpërndarje, ruajtje", "likes, comments, shares, saves")}</small></article>
      <article className="instagram-stat instagram-stat-highlight"><span>{t("SHITJE TË ATRIBUUARA", "ATTRIBUTED SALES")}</span><strong>{euro.format(attributedSales)}</strong><small>{totalOrders} {t("porosi të regjistruara", "orders tracked")}</small></article>
    </section>
    <div className="instagram-toolbar">
      <label className="control instagram-search"><span>{t("Kërko postime", "Search posts")}</span><input className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Përshkrim, lidhje, produkt…", "Caption, URL, product…")} /></label>
      <label className="control"><span>{t("Gjendja", "Status")}</span><select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
        <option value="all">{t("Të gjitha", "All statuses")}</option><option value="planned">{t("Planifikuar", "Planned")}</option><option value="published">{t("Publikuar", "Published")}</option>
      </select></label>
      <label className="control"><span>{t("Lloji", "Type")}</span><select className="input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
        <option value="all">{t("Të gjitha", "All types")}</option><option value="post">{t("Postim", "Post")}</option><option value="reel">Reel</option><option value="story">Story</option>
      </select></label>
    </div>
    {visiblePosts.length ? <div className="instagram-post-list">{visiblePosts.map((post) => {
      const engagement = post.likes + post.comments + post.shares + post.saves;
      const engagementRate = post.reach > 0 ? `${(engagement / post.reach * 100).toFixed(1)}%` : "—";
      const linkedProducts = post.productIds.map((id) => productById.get(id)).filter((product) => product !== undefined);
      return <article className="instagram-post-card" key={post.id}>
        <div className="instagram-post-top">
          <div className="instagram-post-type">{post.mediaType === "reel" ? "REEL" : post.mediaType === "story" ? "STORY" : t("POSTIM", "POST")}<span>·</span>{post.status === "published" ? t("Publikuar", "Published") : t("Planifikuar", "Planned")}</div>
          <time dateTime={post.postDate}>{new Intl.DateTimeFormat(data.language === "sq" ? "sq-AL" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${post.postDate}T12:00:00`))}</time>
        </div>
        <p className="instagram-post-caption">{post.caption}</p>
        {linkedProducts.length > 0 && <div className="instagram-product-chips">{linkedProducts.map((product) => <span className="collection-product-chip" key={product.id}>{product.name}</span>)}</div>}
        {post.status === "published" && <div className="instagram-metrics">
          <div><span>{t("Shtrirja", "Reach")}</span><strong>{post.reach.toLocaleString()}</strong></div>
          <div><span>{t("Pëlqime", "Likes")}</span><strong>{post.likes.toLocaleString()}</strong></div>
          <div><span>{t("Komente", "Comments")}</span><strong>{post.comments.toLocaleString()}</strong></div>
          <div><span>{t("Shpërndarje", "Shares")}</span><strong>{post.shares.toLocaleString()}</strong></div>
          <div><span>{t("Ruajtje", "Saves")}</span><strong>{post.saves.toLocaleString()}</strong></div>
          <div><span>{t("Ndërveprim", "Engagement")}</span><strong>{engagementRate}</strong></div>
          <div><span>{t("Vizita profilit", "Profile visits")}</span><strong>{post.profileVisits.toLocaleString()}</strong></div>
          <div><span>{t("Porosi · shitje", "Orders · sales")}</span><strong>{post.orders} · {euro.format(post.salesRevenue)}</strong></div>
        </div>}
        <div className="instagram-post-actions">
          {post.postUrl && <a className="text-button" href={post.postUrl} target="_blank" rel="noreferrer">{t("Hap postimin", "Open Instagram post")} ↗</a>}
          <span />
          <button className="text-button" onClick={() => { setEditingPost(post); setShowForm(true); }}>{t("Ndrysho", "Edit")}</button>
          <button className="text-button instagram-delete" onClick={() => void deletePost(post)}>{t("Fshi", "Delete")}</button>
        </div>
      </article>;
    })}</div> : <EmptyState title={query || statusFilter !== "all" || typeFilter !== "all" ? t("Nuk ka postime që përputhen", "No matching posts") : t("Filloni të ndiqni postimet tuaja", "Start tracking your Instagram posts")}>
      {query || statusFilter !== "all" || typeFilter !== "all"
        ? t("Ndryshoni kërkimin ose filtrat dhe provoni përsëri.", "Adjust the search or filters and try again.")
        : t("Shtoni postimet, lidhni produktet dhe regjistroni manualisht statistikat nga Instagram Insights.", "Add posts, link products, and manually enter metrics from Instagram Insights.")}
    </EmptyState>}
    {showForm && <PostDialog key={editingPost?.id ?? "new-post"} post={editingPost} products={data.products} onClose={() => setShowForm(false)} />}
  </div>;
}
