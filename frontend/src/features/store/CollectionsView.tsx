import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createId, localDateTime, tr, type CollectionReminder, type ProductCollection } from "./model";
import { useStore } from "./StoreContext";
import { useAuth } from "@/app/AuthContext";
import { appConfig } from "@/app/config";
import { api } from "@/shared/api/client";
import { Dialog, EmptyState, PageHeader } from "./StoreUI";

type MessageChannel = "whatsapp" | "viber";

interface MessagingStatus {
  provider: string;
  whatsapp: { configured: boolean; requirements: string[] };
  viber: { configured: boolean; requirements: string[] };
}

interface SendResponse {
  channel: MessageChannel;
  results: { reminderId: string; customerName: string; status: "accepted" | "failed" | "unknown"; messageId: string | null }[];
}

interface CampaignStatus {
  reminderId: string;
  status: "Pending" | "Accepted" | "Failed" | "Unknown";
  messageId: string | null;
  attempt: number;
  updatedAt: string;
}

function reminderStatus(status: CampaignStatus["status"]): "accepted" | "failed" | "unknown" {
  if (status === "Accepted") return "accepted";
  if (status === "Failed") return "failed";
  return "unknown";
}

function normalizeWhatsAppNumber(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `383${digits.slice(1)}`;
  else if (!digits.startsWith("383")) digits = `383${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function customersFromOrders(orders: ReturnType<typeof useStore>["data"]["orders"]) {
  const customers = new Map<string, { name: string; phone: string }>();
  for (const order of orders) {
    const phone = normalizeWhatsAppNumber(order.customerPhone);
    if (phone && !customers.has(phone)) customers.set(phone, { name: order.customerName, phone });
  }
  return [...customers.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function NewCollectionDialog({ onClose }: { onClose: () => void }) {
  const { data, commit } = useStore();
  const t = (sq: string, en: string) => tr(data.language, sq, en);
  const customers = useMemo(() => customersFromOrders(data.orders), [data.orders]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().slice(0, 10));
  const [productIds, setProductIds] = useState<string[]>([]);
  const [customerPhones, setCustomerPhones] = useState<string[]>([]);
  const [consents, setConsents] = useState<Record<string, { whatsapp: boolean; viber: boolean; viberIntro: boolean }>>({});
  const [error, setError] = useState("");

  const updateConsent = (phone: string, channel: "whatsapp" | "viber", consent: boolean) => {
    setConsents((current) => ({
      ...current,
      [phone]: { whatsapp: current[phone]?.whatsapp ?? false, viber: current[phone]?.viber ?? false, viberIntro: current[phone]?.viberIntro ?? false, [channel]: consent },
    }));
  };

  const updateViberIntro = (phone: string, sent: boolean) => {
    setConsents((current) => ({
      ...current,
      [phone]: { whatsapp: current[phone]?.whatsapp ?? false, viber: current[phone]?.viber ?? false, viberIntro: sent },
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError(t("Shënoni emrin e koleksionit.", "Enter a collection name."));
    if (!arrivalDate) return setError(t("Zgjidhni datën e ardhjes.", "Choose an arrival date."));
    if (customerPhones.some((phone) => {
      const consent = consents[phone];
      return !consent?.whatsapp && !consent?.viber;
    })) return setError(t("Për çdo klient të zgjedhur, shënoni pëlqimin për kanalin përkatës.", "For each selected customer, record consent for at least one channel."));
    if (customerPhones.some((phone) => consents[phone]?.viber && !consents[phone]?.viberIntro)) {
      return setError(t("Për Viber, konfirmoni se klienti e ka marrë më parë njoftimin fillestar jo-promocional.", "For Viber, confirm the customer has already received the required non-promotional introduction."));
    }
    const recipients: CollectionReminder[] = customers
      .filter((customer) => customerPhones.includes(customer.phone))
      .map((customer) => {
        const consent = consents[customer.phone] ?? { whatsapp: false, viber: false, viberIntro: false };
        return {
          id: createId(),
          customerName: customer.name,
          phone: customer.phone,
          whatsappOptIn: consent.whatsapp,
          viberOptIn: consent.viber,
          consentCapturedAt: consent.whatsapp || consent.viber ? localDateTime(new Date()) : undefined,
          viberIntroConfirmed: consent.viberIntro,
        };
      });
    const collection: ProductCollection = {
      id: createId(),
      name: name.trim(),
      description: description.trim(),
      arrivalDate,
      productIds,
      reminders: recipients,
      createdAt: localDateTime(new Date()),
    };
    if (!await commit((current) => ({ ...current, collections: [collection, ...current.collections] }))) {
      setError(t("Koleksioni nuk u ruajt. Kontrolloni lidhjen me serverin.", "The collection was not saved. Check your server connection."));
      return;
    }
    onClose();
  };

  return <Dialog title={t("Shto koleksion të ri", "Add a new collection")} onClose={onClose} wide>
    <form className="store-form" onSubmit={(event) => void submit(event)}>
      <div className="form-grid">
        <label className="control"><span>{t("Emri i koleksionit *", "Collection name *")}</span><input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Koleksioni pranverë 2026", "Spring 2026 collection")} /></label>
        <label className="control"><span>{t("Data e ardhjes", "Arrival date")}</span><input className="input" type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} /></label>
      </div>
      <label className="control"><span>{t("Përshkrimi", "Description")}</span><textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("Pëlhura të reja, ngjyra, informata për porosi…", "New fabrics, colors, ordering information…")} /></label>
      <section className="selection-panel">
        <div className="section-title"><div><strong>{t("Produktet e reja", "New products")}</strong><small>{t("Zgjidhni modelet që kanë ardhur", "Select styles that arrived")}</small></div><span className="soft-chip">{productIds.length}</span></div>
        {data.products.length ? <div className="selection-list">{data.products.map((product) => <label className="selection-item" key={product.id}><input type="checkbox" checked={productIds.includes(product.id)} onChange={(e) => setProductIds((current) => e.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id))} /><span><strong>{product.name}</strong><small>{product.brand} · {product.variants.map((variant) => variant.color).filter(Boolean).join(", ")}</small></span><b>{product.retailPrice.toFixed(2)} €</b></label>)}</div> : <p className="muted">{t("Shtoni produkte në katalog për t'i përfshirë këtu.", "Add products to the catalogue to select them here.")}</p>}
      </section>
      <section className="selection-panel">
        <div className="section-title"><div><strong>{t("Klientët për njoftim", "Customers for reminders")}</strong><small>{t("Zgjidhni vetëm klientët që kanë dhënë pëlqim për kanalin përkatës.", "Select only customers who opted in to each channel.")}</small></div><span className="soft-chip">{customerPhones.length}</span></div>
        <div className="consent-heading"><span>{t("Klienti", "Customer")}</span><span>WhatsApp</span><span>Viber</span><span>{t("Hyrje Viber", "Viber intro")}</span></div>
        {customers.length ? <div className="selection-list customer-selection">{customers.map((customer) => {
          const consent = consents[customer.phone] ?? { whatsapp: false, viber: false, viberIntro: false };
          return <div className="consent-row" key={customer.phone}>
            <label className="selection-item"><input type="checkbox" checked={customerPhones.includes(customer.phone)} onChange={(e) => setCustomerPhones((current) => e.target.checked ? [...current, customer.phone] : current.filter((phone) => phone !== customer.phone))} /><span><strong>{customer.name}</strong><small>+{customer.phone}</small></span></label>
            <label className="consent-check" title={t("Pëlqimi i klientit për marketing në WhatsApp", "Customer consent to WhatsApp marketing")}><input type="checkbox" aria-label={`${customer.name} WhatsApp`} checked={consent.whatsapp} onChange={(e) => updateConsent(customer.phone, "whatsapp", e.target.checked)} /></label>
            <label className="consent-check" title={t("Pëlqimi i klientit për marketing në Viber", "Customer consent to Viber marketing")}><input type="checkbox" aria-label={`${customer.name} Viber`} checked={consent.viber} onChange={(e) => updateConsent(customer.phone, "viber", e.target.checked)} /></label>
            <label className="consent-check" title={t("Konfirmo se është dërguar hyrja jo-promocionale në Viber", "Confirm Viber non-promotional introduction was sent")}><input type="checkbox" aria-label={`${customer.name} Viber intro`} checked={consent.viberIntro} disabled={!consent.viber} onChange={(e) => updateViberIntro(customer.phone, e.target.checked)} /></label>
          </div>;
        })}</div> : <p className="muted">{t("Klientët shfaqen këtu pasi të regjistroni porosi me numër telefoni.", "Customers appear here after you save an order with a phone number.")}</p>}
        <p className="settings-footnote">{t("Pëlqimi regjistrohet veçmas. Për WhatsApp, dërgohen vetëm modele marketingu të miratuara. Për Viber, shënoni hyrjen jo-promocionale vetëm nëse është dërguar më parë. Ruajtja nuk dërgon mesazhe.", "Consent is recorded separately. WhatsApp sends only approved marketing templates. For Viber, mark the non-promotional introduction only if it was previously sent. Saving sends no messages.")}</p>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button button-light" onClick={onClose}>{t("Anulo", "Cancel")}</button><button type="submit" className="button button-dark">{t("Ruaj koleksionin", "Save collection")}</button></div>
    </form>
  </Dialog>;
}

export function CollectionsView() {
  const { data, commit } = useStore();
  const { role } = useAuth();
  const t = (sq: string, en: string) => tr(data.language, sq, en);
  const [showForm, setShowForm] = useState(false);
  const [channel, setChannel] = useState<MessageChannel>("whatsapp");
  const [messaging, setMessaging] = useState<MessagingStatus | null>(null);
  const [messagingError, setMessagingError] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<Record<string, string[]>>({});
  const [sendingCollection, setSendingCollection] = useState("");
  const [sendFeedback, setSendFeedback] = useState("");
  const productById = new Map(data.products.map((product) => [product.id, product]));
  const configured = channel === "whatsapp" ? messaging?.whatsapp.configured === true : messaging?.viber.configured === true;

  useEffect(() => {
    if (!appConfig.apiBaseUrl) return;
    let active = true;
    api.get<MessagingStatus>("/api/messaging/status")
      .then((status) => { if (active) setMessaging(status); })
      .catch((reason: unknown) => {
        if (active) setMessagingError(reason instanceof Error ? reason.message : t("Nuk mund të kontrollohet konfigurimi i mesazheve.", "Could not check messaging configuration."));
      });
    return () => { active = false; };
  }, []);

  const sendCampaign = async (collection: ProductCollection) => {
    const reminderIds = selectedRecipients[collection.id] ?? [];
    if (!reminderIds.length) return setSendFeedback(t("Zgjidhni së paku një klient me pëlqim aktiv.", "Select at least one opted-in customer."));
    setSendingCollection(collection.id);
    setSendFeedback("");
    try {
      const response = await api.post<SendResponse>("/api/messaging/send", {
        collectionId: collection.id,
        channel,
        language: data.language,
        reminderIds,
      });
      const sentAt = localDateTime(new Date());
      const stored = await commit((current) => ({
        ...current,
        collections: current.collections.map((item) => item.id !== collection.id ? item : {
          ...item,
          reminders: item.reminders.map((reminder) => {
            const result = response.results.find((entry) => entry.reminderId === reminder.id);
            if (!result) return reminder;
            return channel === "whatsapp"
              ? { ...reminder, whatsappSendStatus: result.status, whatsappSentAt: result.status === "accepted" ? sentAt : reminder.whatsappSentAt, whatsappMessageId: result.messageId ?? undefined }
              : { ...reminder, viberSendStatus: result.status, viberSentAt: result.status === "accepted" ? sentAt : reminder.viberSentAt, viberMessageId: result.messageId ?? undefined };
          }),
        }),
      }));
      setSelectedRecipients((current) => ({ ...current, [collection.id]: [] }));
      const accepted = response.results.filter((result) => result.status === "accepted").length;
      const failed = response.results.filter((result) => result.status === "failed").length;
      const unknown = response.results.filter((result) => result.status === "unknown").length;
      setSendFeedback(`${accepted} ${t("mesazhe të pranuara nga ofruesi", "messages accepted by provider")}${failed ? ` · ${failed} ${t("u refuzuan", "were rejected")}` : ""}${unknown ? ` · ${unknown} ${t("me status të paqartë — mos i riprovoni", "with uncertain status — do not retry")}` : ""}${stored ? "" : ` · ${t("statusi lokal nuk u ruajt", "local status could not be saved")}`}`);
    } catch (reason) {
      let feedback = reason instanceof Error ? reason.message : t("Dërgimi dështoi.", "Sending failed.");
      try {
        const statuses = await api.get<CampaignStatus[]>(`/api/messaging/campaign/${collection.id}/${channel}`);
        const stored = await commit((current) => ({
          ...current,
          collections: current.collections.map((item) => item.id !== collection.id ? item : {
            ...item,
            reminders: item.reminders.map((reminder) => {
              const status = statuses.find((entry) => entry.reminderId === reminder.id);
              if (!status) return reminder;
              return channel === "whatsapp"
                ? { ...reminder, whatsappSendStatus: reminderStatus(status.status), whatsappSentAt: status.status === "Accepted" ? status.updatedAt : reminder.whatsappSentAt, whatsappMessageId: status.messageId ?? undefined }
                : { ...reminder, viberSendStatus: reminderStatus(status.status), viberSentAt: status.status === "Accepted" ? status.updatedAt : reminder.viberSentAt, viberMessageId: status.messageId ?? undefined };
            }),
          }),
        }));
        if (!stored) feedback += ` ${t("Nuk u ruajt statusi i fushatës.", "Campaign status could not be saved.")}`;
      } catch (statusReason) {
        feedback += ` ${t("Nuk mund të verifikohet statusi te serveri:", "Could not verify send status with server:")} ${statusReason instanceof Error ? statusReason.message : ""}`;
      }
      setSendFeedback(feedback);
    } finally {
      setSendingCollection("");
    }
  };

  const revokeConsent = async (reminder: CollectionReminder) => {
    const saved = await commit((current) => ({
      ...current,
      collections: current.collections.map((collection) => ({
        ...collection,
        reminders: collection.reminders.map((entry) => normalizeWhatsAppNumber(entry.phone) !== normalizeWhatsAppNumber(reminder.phone) ? entry : channel === "whatsapp"
          ? { ...entry, whatsappOptIn: false, consentCapturedAt: entry.viberOptIn ? entry.consentCapturedAt : undefined }
          : { ...entry, viberOptIn: false, viberIntroConfirmed: false, consentCapturedAt: entry.whatsappOptIn ? entry.consentCapturedAt : undefined }),
      })),
    }));
    setSelectedRecipients((current) => Object.fromEntries(Object.entries(current).map(([id, selected]) => [
      id, selected.filter((reminderId) => reminderId !== reminder.id),
    ])));
    setSendFeedback(saved
      ? t("Pëlqimi u çaktivizua për këtë kanal në kontaktet e ruajtura.", "Consent was revoked for this channel across saved contacts.")
      : t("Nuk mund të ruajmë ndryshimin e pëlqimit.", "Could not save the consent change."));
  };

  return <div className="view">
    <PageHeader eyebrow={t("KOLEKSIONI I RI", "NEW ARRIVALS")} title={t("Koleksionet", "Collections")} description={t("Ruani ardhjet e reja dhe lajmëroni klientët tuaj.", "Track new arrivals and let your customers know.")}
      action={<button className="button button-dark" onClick={() => setShowForm(true)}>+ {t("Koleksion i ri", "New collection")}</button>} />
    <section className="message-setup">
      <div className="message-setup-heading"><div><div className="eyebrow">{t("KONFIGURIMI I MESAZHEVE", "MESSAGING CONFIGURATION")}</div><h2>{t("Dërgo nga web-i", "Send from the web")}</h2><p>{t("Mesazhet dërgohen përmes API-së së sigurt të Infobip; klientët nuk kanë nevojë të hapin WhatsApp ose Viber.", "Messages go through the secure Infobip API; customers do not need to open WhatsApp or Viber.")}</p></div><span className="soft-chip">{messaging?.provider ?? "Infobip"}</span></div>
      {messagingError && <p className="form-error" role="alert">{t("Nuk mund të lexojmë gjendjen e konfigurimit:", "Could not read configuration status:")} {messagingError}</p>}
      <div className="provider-status-grid">
        <div className="provider-status"><span>WhatsApp Business</span><strong className={messaging?.whatsapp.configured ? "provider-ready" : "provider-missing"}>{messaging?.whatsapp.configured ? t("Gati", "Ready") : t("Nuk është konfiguruar", "Not configured")}</strong><small>{t("Kërkon dërgues dhe model marketingu të miratuar.", "Requires a sender and approved marketing template.")}</small></div>
        <div className="provider-status"><span>Viber Business</span><strong className={messaging?.viber.configured ? "provider-ready" : "provider-missing"}>{messaging?.viber.configured ? t("Gati", "Ready") : t("Nuk është konfiguruar", "Not configured")}</strong><small>{t("Kërkon dërgues të miratuar dhe aprovimin e destinacionit Kosovë.", "Requires an approved sender and Kosovo destination approval.")}</small></div>
      </div>
      <details className="message-setup-details"><summary>{t("Shfaq udhëzimet për administratorin", "Show administrator setup instructions")}</summary>
        <p>{t("Krijoni llogari Infobip, aktivizoni WhatsApp Business dhe kërkoni miratimin e Viber Business. Konfirmoni me Infobip mbulimin dhe çmimin për numrat +383 para aktivizimit.", "Create an Infobip account, activate WhatsApp Business, and request Viber Business approval. Confirm +383 coverage and pricing with Infobip before activation.")}</p>
        <p>{t("Vendosni këto si sekrete në hostin e API-së (.NET), jo në GitHub Pages ose në këtë shfletues:", "Set these as secrets on the .NET API host, not in GitHub Pages or this browser:")}</p>
        <code>Messaging__Infobip__BaseUrl · Messaging__Infobip__ApiKey · Messaging__WhatsApp__Sender · Messaging__WhatsApp__TemplateName · Messaging__WhatsApp__Language · Messaging__Viber__Sender</code>
        <p>{t("Modeli WhatsApp duhet të jetë i miratuar për marketing dhe të ketë 4 variabla në trup, sipas radhës: emri i klientit, emri i koleksionit, data e ardhjes, produktet.", "The approved WhatsApp marketing template must have 4 body placeholders in this order: customer name, collection name, arrival date, products.")}</p>
        <div className="message-provider-links"><a href="https://www.infobip.com/docs/whatsapp/get-started" target="_blank" rel="noreferrer">WhatsApp setup ↗</a><a href="https://www.infobip.com/docs/viber/business-messages/get-started" target="_blank" rel="noreferrer">Viber setup ↗</a><a href="https://www.infobip.com/docs/whatsapp/compliance/user-opt-ins" target="_blank" rel="noreferrer">{t("Rregullat e pëlqimit", "Opt-in rules")} ↗</a></div>
      </details>
    </section>
    {sendFeedback && <p className="success-message" role="status">{sendFeedback}</p>}
    {data.collections.length ? <div className="collection-list">{data.collections.map((collection) => {
      const productNames = collection.productIds.flatMap((id) => {
        const product = productById.get(id);
        return product ? [product.name] : [];
      });
      return <article className="collection-card" key={collection.id}>
        <div className="collection-card-head"><div className="collection-symbol">✳</div><div className="collection-heading"><span className="eyebrow">{t("ARDHJE E RE", "NEW ARRIVAL")} · {collection.arrivalDate}</span><h2>{collection.name}</h2></div><button className="icon-button" aria-label={t("Fshi koleksionin", "Delete collection")} title={t("Fshi koleksionin", "Delete collection")} onClick={() => {
          if (window.confirm(t("Të fshihet ky koleksion?", "Delete this collection?"))) {
            void commit((current) => ({ ...current, collections: current.collections.filter((item) => item.id !== collection.id) }));
          }
        }}>×</button></div>
        {collection.description && <p className="collection-description">{collection.description}</p>}
        {productNames.length > 0 && <div className="collection-products">{collection.productIds.map((id) => {
          const product = productById.get(id);
          return product ? <span className="collection-product-chip" key={id}>{product.name}<small>{product.retailPrice.toFixed(2)} €</small></span> : null;
        })}</div>}
        <div className="campaign-toolbar">
          <div className="channel-tabs" role="group" aria-label={t("Kanali i mesazhit", "Message channel")}>
            <button type="button" className={channel === "whatsapp" ? "channel-tab selected" : "channel-tab"} onClick={() => setChannel("whatsapp")}>WhatsApp</button>
            <button type="button" className={channel === "viber" ? "channel-tab selected" : "channel-tab"} onClick={() => setChannel("viber")}>Viber</button>
          </div>
          <button className="button button-dark" disabled={role !== "Owner" || !configured || sendingCollection === collection.id || !(selectedRecipients[collection.id]?.length)} onClick={() => void sendCampaign(collection)}>
            {sendingCollection === collection.id ? t("Duke dërguar…", "Sending…") : `${t("Dërgo", "Send")} ${selectedRecipients[collection.id]?.length ?? 0} ${channel === "whatsapp" ? "WhatsApp" : "Viber"}`}
          </button>
        </div>
        {role !== "Owner" && <p className="settings-footnote">{t("Vetëm pronari mund të dërgojë fushata mesazhesh.", "Only the store owner can send messaging campaigns.")}</p>}
        {!configured && <p className="settings-footnote">{t("Dërgimi është i çaktivizuar derisa administratori të konfigurojë këtë kanal te hosti i API-së.", "Sending is disabled until an administrator configures this channel on the API host.")}</p>}
        <div className="collection-reminders"><strong>{t("Përzgjidhni marrësit", "Select recipients")} · {collection.reminders.length}</strong>
          {collection.reminders.length ? collection.reminders.map((reminder) => {
            const consent = channel === "whatsapp" ? reminder.whatsappOptIn === true : reminder.viberOptIn === true && reminder.viberIntroConfirmed === true;
            const status = channel === "whatsapp" ? reminder.whatsappSendStatus : reminder.viberSendStatus;
            const locked = status === "accepted" || status === "unknown";
            const selected = (selectedRecipients[collection.id] ?? []).includes(reminder.id);
            return <div className="reminder-row" key={reminder.id}>
              <input aria-label={`${reminder.customerName} ${channel}`} type="checkbox" checked={selected} disabled={!consent || locked} onChange={(event) => setSelectedRecipients((current) => {
                const currentIds = current[collection.id] ?? [];
                return { ...current, [collection.id]: event.target.checked ? [...currentIds, reminder.id] : currentIds.filter((id) => id !== reminder.id) };
              })} />
              <span className="reminder-avatar">{reminder.customerName.slice(0, 1).toLocaleUpperCase()}</span>
              <div className="reminder-person"><strong>{reminder.customerName}</strong><small>+{reminder.phone}</small></div>
              <span className={`consent-badge ${consent ? "consent-yes" : "consent-no"}`}>{consent ? t("Pëlqimi në rregull", "Opted in") : t("Pa pëlqim", "No opt-in")}</span>
              <span className={`reminder-status reminder-${status ?? "idle"}`}>{status === "accepted" ? t("Pranuar nga ofruesi", "Provider accepted") : status === "failed" ? t("Dështoi — mund të riprovohet", "Failed — can retry") : status === "unknown" ? t("Status i paqartë — mos riprovoni", "Status uncertain — do not retry") : ""}</span>
              {(channel === "whatsapp" ? reminder.whatsappOptIn : reminder.viberOptIn) && <button className="text-button consent-revoke" onClick={() => void revokeConsent(reminder)}>{t("Çregjistro", "Opt out")}</button>}
            </div>;
          }) : <p className="muted">{t("Nuk u zgjodh asnjë klient për këtë njoftim.", "No customers were selected for this reminder.")}</p>}
          {channel === "viber" && <p className="settings-footnote">{t("Promocionet në Viber dërgohen vetëm te klientët me pëlqim dhe hyrje jo-promocionale të konfirmuar. Pranimi nga ofruesi nuk garanton dorëzim.", "Viber promotions are sent only to opted-in customers with a confirmed non-promotional introduction. Provider acceptance does not guarantee delivery.")}</p>}
        </div>
      </article>;
    })}</div> : <EmptyState title={t("Koleksioni i ri meriton një prezantim", "A new collection deserves an introduction")}>{t("Krijoni një koleksion dhe zgjidhni klientët që kanë dhënë pëlqim për njoftime.", "Create a collection and choose customers who opted in to receive reminders.")}</EmptyState>}
    {showForm && <NewCollectionDialog onClose={() => setShowForm(false)} />}
  </div>;
}
