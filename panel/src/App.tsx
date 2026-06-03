import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Building2,
  Calendar,
  CheckCircle2,
  CircleSlash,
  Database,
  Edit3,
  Eye,
  Fingerprint,
  Grid2X2,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  X
} from "lucide-react";

type Status = "ACTIVE" | "INACTIVE";
type Section = "dashboard" | "users" | "clients" | "events" | "config";

type ModelConfig = {
  modelVersion: string;
  faceThreshold: number;
  livenessThreshold: number;
  embeddingDimension: number;
  modelChecksum: string;
  active: boolean;
};

type LivenessConfig = {
  challengeTypes: string[];
  active: boolean;
};

type TenantConfig = {
  MODEL_CONFIG: ModelConfig;
  LIVENESS_CONFIG: LivenessConfig;
};

type Tenant = {
  id: string;
  name: string;
  status: Status;
  configs: TenantConfig;
  createdAt: string;
  updatedAt: string;
};

type Embedding = {
  id: string;
  vector: number[];
};

type User = {
  id: string;
  tenantId: string;
  employeeId: string;
  username: string;
  name: string;
  role: string;
  status: Status;
  embeddings: Embedding[];
  createdAt: string;
  updatedAt: string;
};

type Client = {
  id: string;
  clientId: string;
  tenantId: string;
  userId: string;
  deviceType: string;
  deviceName: string;
  platform: string;
  appVersion: string;
  imei?: string;
  status: Status;
  activatedAt: string;
  deactivatedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type AuthEvent = {
  id: string;
  tenantId: string;
  userId: string;
  clientId: string;
  eventId: string;
  result: string;
  failureReason?: string;
  faceScore: number;
  livenessScore: number;
  challengeTypes: string[];
  latencyMs: number;
  embedding: number[];
  capturedAt: string;
  receivedAt: string;
  purgeStatus: string;
};

type TenantForm = {
  name: string;
  status: Status;
  model: ModelConfig;
  liveness: LivenessConfig;
};

type EmbeddingForm = {
  id: string;
  vectorText: string;
};

type UserForm = {
  employeeId: string;
  username: string;
  password: string;
  name: string;
  role: string;
  embeddings: EmbeddingForm[];
};

type ClientForm = {
  userId: string;
  deviceType: string;
  deviceName: string;
  platform: string;
  appVersion: string;
  imei: string;
  status: Status;
};

const challengeOptions = ["BLINK", "SMILE", "TURN_LEFT", "TURN_RIGHT", "NOD"];

const defaultConfig: TenantConfig = {
  MODEL_CONFIG: {
    modelVersion: "facenet-v1",
    faceThreshold: 0.82,
    livenessThreshold: 0.77,
    embeddingDimension: 3,
    modelChecksum: "sha256:demo",
    active: true
  },
  LIVENESS_CONFIG: {
    challengeTypes: ["BLINK", "SMILE"],
    active: true
  }
};

const defaultEmbeddings: Embedding[] = [
  { id: "front", vector: [0.1, 0.2, 0.3] },
  { id: "left", vector: [0.3, 0.2, 0.1] }
];

async function api<T>(path: string, options: RequestInit = {}, tenantId?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (tenantId) {
    headers.set("x-tenant-id", tenantId);
  }
  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.error?.message ?? response.statusText;
    throw new Error(message);
  }
  return data as T;
}

function shortDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-GB");
}

function shortDateTime(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function shortId(value?: string) {
  if (!value) return "-";
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-5)}` : value;
}

function toTenantConfig(form: TenantForm): TenantConfig {
  return {
    MODEL_CONFIG: {
      ...form.model,
      faceThreshold: Number(form.model.faceThreshold),
      livenessThreshold: Number(form.model.livenessThreshold),
      embeddingDimension: Number(form.model.embeddingDimension)
    },
    LIVENESS_CONFIG: {
      active: form.liveness.active,
      challengeTypes: form.liveness.challengeTypes
    }
  };
}

function createTenantForm(tenant?: Tenant): TenantForm {
  const configs = tenant?.configs ?? defaultConfig;
  return {
    name: tenant?.name ?? "",
    status: tenant?.status ?? "ACTIVE",
    model: { ...configs.MODEL_CONFIG },
    liveness: {
      active: configs.LIVENESS_CONFIG.active,
      challengeTypes: [...configs.LIVENESS_CONFIG.challengeTypes]
    }
  };
}

function createEmbeddingForms(embeddings: Embedding[]) {
  return embeddings.map((embedding) => ({
    id: embedding.id,
    vectorText: embedding.vector.join(", ")
  }));
}

function parseEmbeddings(rows: EmbeddingForm[]): Embedding[] {
  return rows
    .filter((row) => row.id.trim() || row.vectorText.trim())
    .map((row, index) => ({
      id: row.id.trim() || `embedding-${index + 1}`,
      vector: row.vectorText
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((value) => !Number.isNaN(value))
    }));
}

function createUserForm(user?: User): UserForm {
  return {
    employeeId: user?.employeeId ?? "",
    username: user?.username ?? "",
    password: "",
    name: user?.name ?? "",
    role: user?.role ?? "",
    embeddings: createEmbeddingForms(user?.embeddings ?? defaultEmbeddings)
  };
}

function createClientForm(userId = "", client?: Client): ClientForm {
  return {
    userId: client?.userId ?? userId,
    deviceType: client?.deviceType ?? "PHONE",
    deviceName: client?.deviceName ?? "",
    platform: client?.platform ?? "ANDROID",
    appVersion: client?.appVersion ?? "1.0.0",
    imei: client?.imei ?? "",
    status: client?.status ?? "ACTIVE"
  };
}

export function App() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenantEditor, setTenantEditor] = useState<Tenant | null | "new">(null);
  const [tenantForm, setTenantForm] = useState<TenantForm>(createTenantForm());
  const [tenantSearch, setTenantSearch] = useState("");
  const [tenantStatus, setTenantStatus] = useState<Status | "">("");

  const [section, setSection] = useState<Section>("dashboard");
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuthEvent | null>(null);
  const [userMode, setUserMode] = useState<"create" | "edit" | "view">("view");
  const [clientMode, setClientMode] = useState<"create" | "edit" | "view">("view");
  const [userForm, setUserForm] = useState<UserForm>(createUserForm());
  const [clientForm, setClientForm] = useState<ClientForm>(createClientForm());

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const filteredTenants = useMemo(() => {
    const query = tenantSearch.trim().toLowerCase();
    return tenants.filter((tenant) => {
      const matchesQuery = !query || `${tenant.name} ${tenant.id}`.toLowerCase().includes(query);
      const matchesStatus = !tenantStatus || tenant.status === tenantStatus;
      return matchesQuery && matchesStatus;
    });
  }, [tenantSearch, tenantStatus, tenants]);

  const selectedUserClients = useMemo(
    () => clients.filter((client) => client.userId === selectedUser?.id),
    [clients, selectedUser]
  );

  const visibleEvents = useMemo(() => {
    if (selectedClient) return events.filter((event) => event.clientId === selectedClient.clientId);
    if (selectedUser) return events.filter((event) => event.userId === selectedUser.id);
    return events;
  }, [events, selectedClient, selectedUser]);

  useEffect(() => {
    void loadTenants();
  }, []);

  async function run(action: () => Promise<void>) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function loadTenants() {
    await run(async () => {
      const data = await api<{ tenants: Tenant[] }>("/api/tenants");
      setTenants(data.tenants ?? []);
    });
  }

  async function selectTenant(tenant: Tenant) {
    await run(async () => {
      const detail = await api<Tenant>(`/api/tenants/${tenant.id}`);
      setSelectedTenant(detail);
      setTenantForm(createTenantForm(detail));
      setSection("dashboard");
      setSelectedUser(null);
      setSelectedClient(null);
      setSelectedEvent(null);
      const [userData, clientData, eventData] = await Promise.all([
        api<{ users: User[] }>("/api/users", {}, detail.id),
        api<{ clients: Client[] }>("/api/clients", {}, detail.id),
        api<{ events: AuthEvent[] }>("/api/admin/events", {}, detail.id)
      ]);
      setUsers(userData.users ?? []);
      setClients(clientData.clients ?? []);
      setEvents(eventData.events ?? []);
    });
  }

  async function refreshSelectedTenant() {
    if (!selectedTenant) return;
    const [detail, userData, clientData, eventData] = await Promise.all([
      api<Tenant>(`/api/tenants/${selectedTenant.id}`),
      api<{ users: User[] }>("/api/users", {}, selectedTenant.id),
      api<{ clients: Client[] }>("/api/clients", {}, selectedTenant.id),
      api<{ events: AuthEvent[] }>("/api/admin/events", {}, selectedTenant.id)
    ]);
    setSelectedTenant(detail);
    setTenantForm(createTenantForm(detail));
    const nextUsers = userData.users ?? [];
    const nextClients = clientData.clients ?? [];
    setUsers(nextUsers);
    setClients(nextClients);
    setEvents(eventData.events ?? []);
    if (selectedUser) setSelectedUser(nextUsers.find((user) => user.id === selectedUser.id) ?? null);
    if (selectedClient) setSelectedClient(nextClients.find((client) => client.clientId === selectedClient.clientId) ?? null);
  }

  function openTenantCreate() {
    setTenantEditor("new");
    setTenantForm(createTenantForm());
  }

  function openTenantEdit(tenant: Tenant) {
    setTenantEditor(tenant);
    setTenantForm(createTenantForm(tenant));
  }

  async function saveTenant() {
    await run(async () => {
      const configs = toTenantConfig(tenantForm);
      if (tenantEditor === "new" || (!selectedTenant && !tenantEditor)) {
        await api<Tenant>("/api/tenants", {
          method: "POST",
          body: JSON.stringify({ name: tenantForm.name, configs })
        });
        setMessage("Tenant created");
        setTenantEditor(null);
        await loadTenants();
        return;
      }
      const target = tenantEditor && typeof tenantEditor !== "string" ? tenantEditor : selectedTenant;
      if (!target) return;
      const tenant = await api<Tenant>(
        "/api/tenant",
        {
          method: "PUT",
          body: JSON.stringify({ name: tenantForm.name, status: tenantForm.status, configs })
        },
        target.id
      );
      setMessage("Tenant updated");
      setTenantEditor(null);
      await loadTenants();
      if (selectedTenant?.id === tenant.id) await selectTenant(tenant);
    });
  }

  async function deactivateTenant(tenant: Tenant) {
    await run(async () => {
      await api<Tenant>("/api/tenant", { method: "DELETE" }, tenant.id);
      setMessage("Tenant deactivated");
      if (selectedTenant?.id === tenant.id) {
        setSelectedTenant(null);
        setUsers([]);
        setClients([]);
        setEvents([]);
      }
      await loadTenants();
    });
  }

  function startCreateUser() {
    setUserMode("create");
    setSelectedUser(null);
    setSelectedClient(null);
    setUserForm(createUserForm());
    setSection("users");
  }

  function openUser(user: User) {
    setSelectedUser(user);
    setUserMode("edit");
    setUserForm(createUserForm(user));
    setSelectedClient(null);
    setClientMode("view");
    setClientForm(createClientForm(user.id));
    setSection("users");
  }

  async function saveUser() {
    if (!selectedTenant) return;
    await run(async () => {
      const payload: Record<string, unknown> = {
        employeeId: userForm.employeeId,
        username: userForm.username,
        name: userForm.name,
        role: userForm.role,
        embeddings: parseEmbeddings(userForm.embeddings)
      };
      if (userMode === "create" || userForm.password.trim()) {
        payload.password = userForm.password;
      }
      if (userMode === "create") {
        const user = await api<User>("/api/users", { method: "POST", body: JSON.stringify(payload) }, selectedTenant.id);
        setSelectedUser(user);
        setUserMode("edit");
        setUserForm(createUserForm(user));
        setMessage("User created");
      } else if (selectedUser) {
        const user = await api<User>(
          `/api/users/${selectedUser.id}`,
          { method: "PUT", body: JSON.stringify(payload) },
          selectedTenant.id
        );
        setSelectedUser(user);
        setUserForm(createUserForm(user));
        setMessage("User updated");
      }
      await refreshSelectedTenant();
    });
  }

  async function deactivateUser(user: User) {
    if (!selectedTenant) return;
    await run(async () => {
      await api<User>(`/api/users/${user.id}`, { method: "DELETE" }, selectedTenant.id);
      setMessage("User deactivated");
      if (selectedUser?.id === user.id) {
        setSelectedUser(null);
        setSelectedClient(null);
      }
      await refreshSelectedTenant();
    });
  }

  function startCreateClient(userId = selectedUser?.id ?? users[0]?.id ?? "") {
    setClientMode("create");
    setSelectedClient(null);
    setClientForm(createClientForm(userId));
    setSection(selectedUser ? "users" : "clients");
  }

  function openClient(client: Client) {
    setSelectedClient(client);
    setClientMode("edit");
    setClientForm(createClientForm(client.userId, client));
  }

  async function saveClient() {
    if (!selectedTenant) return;
    await run(async () => {
      if (clientMode === "create") {
        const client = await api<Client>(
          "/api/clients",
          {
            method: "POST",
            body: JSON.stringify({
              userId: clientForm.userId,
              deviceType: clientForm.deviceType,
              deviceName: clientForm.deviceName,
              platform: clientForm.platform,
              appVersion: clientForm.appVersion,
              imei: clientForm.imei
            })
          },
          selectedTenant.id
        );
        setSelectedClient(client);
        setClientMode("edit");
        setClientForm(createClientForm(client.userId, client));
        setMessage("Client registered");
      } else if (selectedClient) {
        const client = await api<Client>(
          `/api/clients/${selectedClient.clientId}`,
          {
            method: "PUT",
            body: JSON.stringify({
              deviceType: clientForm.deviceType,
              deviceName: clientForm.deviceName,
              platform: clientForm.platform,
              appVersion: clientForm.appVersion,
              imei: clientForm.imei,
              status: clientForm.status
            })
          },
          selectedTenant.id
        );
        setSelectedClient(client);
        setClientForm(createClientForm(client.userId, client));
        setMessage("Client updated");
      }
      await refreshSelectedTenant();
    });
  }

  async function deactivateClient(client: Client) {
    if (!selectedTenant) return;
    await run(async () => {
      const updated = await api<Client>(`/api/clients/${client.clientId}`, { method: "DELETE" }, selectedTenant.id);
      setSelectedClient(updated);
      setClientForm(createClientForm(updated.userId, updated));
      setMessage("Client deactivated");
      await refreshSelectedTenant();
    });
  }

  function updateModel<K extends keyof ModelConfig>(key: K, value: ModelConfig[K]) {
    setTenantForm((prev) => ({ ...prev, model: { ...prev.model, [key]: value } }));
  }

  function updateLivenessChallenge(challenge: string) {
    setTenantForm((prev) => {
      const current = prev.liveness.challengeTypes;
      const challengeTypes = current.includes(challenge)
        ? current.filter((item) => item !== challenge)
        : [...current, challenge];
      return { ...prev, liveness: { ...prev.liveness, challengeTypes } };
    });
  }

  function updateEmbedding(index: number, patch: Partial<EmbeddingForm>) {
    setUserForm((prev) => ({
      ...prev,
      embeddings: prev.embeddings.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    }));
  }

  function addEmbedding() {
    setUserForm((prev) => ({
      ...prev,
      embeddings: [...prev.embeddings, { id: `embedding-${prev.embeddings.length + 1}`, vectorText: "0.1, 0.2, 0.3" }]
    }));
  }

  function removeEmbedding(index: number) {
    setUserForm((prev) => ({
      ...prev,
      embeddings: prev.embeddings.filter((_, rowIndex) => rowIndex !== index)
    }));
  }

  const notice = (message || error || loading) && (
    <div className={`inlineNotice ${error ? "error" : ""}`}>
      {loading && <Loader2 className="spin" size={16} />}
      {error || message || "Working..."}
    </div>
  );

  if (!selectedTenant) {
    return (
      <main className="tenantListPage">
        <header className="tenantListHero">
          <div>
            <h1>Face Auth</h1>
            <p>Multi-tenant Management Panel</p>
          </div>
          {notice}
        </header>

        <section className="tableCard tenantTableCard">
          <div className="tableToolbar">
            <div className="searchBox">
              <Search size={20} />
              <input
                aria-label="Search tenants"
                placeholder="Search tenants..."
                value={tenantSearch}
                onChange={(event) => setTenantSearch(event.target.value)}
              />
            </div>
            <select aria-label="Tenant status" value={tenantStatus} onChange={(event) => setTenantStatus(event.target.value as Status | "")}>
              <option value="">All Status</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
            <button className="outlineButton" onClick={() => void loadTenants()}>
              <RefreshCw size={18} />
            </button>
            <button className="primaryButton" onClick={openTenantCreate}>
              <Plus size={18} />
              Create Tenant
            </button>
          </div>

          <DataTable
            headers={["Identifier", "Status", "Model Version", "Embedding Dimension", "Created At", "Actions"]}
            rows={filteredTenants.map((tenant) => [
              <Identifier key="id" title={tenant.name} subtitle={tenant.id} />,
              <StatusPill key="status" status={tenant.status} />,
              tenant.configs.MODEL_CONFIG.modelVersion,
              tenant.configs.MODEL_CONFIG.embeddingDimension,
              shortDate(tenant.createdAt),
              <div className="tableActions" key="actions">
                <button className="iconOnly" title="View tenant" onClick={() => openTenantEdit(tenant)}><Eye size={18} /></button>
                <button className="iconOnly" title="Edit tenant" onClick={() => openTenantEdit(tenant)}><Edit3 size={18} /></button>
                <button className="iconOnly dangerText" title="Deactivate tenant" onClick={() => void deactivateTenant(tenant)}><Trash2 size={18} /></button>
                <button className="selectButton" onClick={() => void selectTenant(tenant)}><LogIn size={18} /> Select</button>
              </div>
            ])}
            emptyText="No tenants found."
          />
        </section>

        {tenantEditor && (
          <section className="tableCard editorCard">
            <div className="cardHeader">
              <h2>{tenantEditor === "new" ? "Create Tenant" : "Tenant Detail"}</h2>
              <button className="iconOnly" onClick={() => setTenantEditor(null)} title="Close"><X size={18} /></button>
            </div>
            <TenantConfigForm
              tenantForm={tenantForm}
              updateTenantForm={setTenantForm}
              updateModel={updateModel}
              updateLivenessChallenge={updateLivenessChallenge}
            />
            <div className="actions">
              <button className="primaryButton" onClick={() => void saveTenant()}><Save size={16} /> Save Tenant</button>
              {tenantEditor !== "new" && <button className="dangerButton" onClick={() => void deactivateTenant(tenantEditor)}><Trash2 size={16} /> Deactivate</button>}
            </div>
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="dashboardShell">
      <aside className="appSidebar">
        <div className="sidebarBrand">
          <h1>Face Auth</h1>
          <p>Management Panel</p>
        </div>
        <div className="currentTenant">
          <Building2 size={18} />
          <span>
            <small>Current Tenant</small>
            <strong>{selectedTenant.name}</strong>
            <small>{selectedTenant.id}</small>
          </span>
        </div>
        <nav>
          <SidebarButton active={section === "dashboard"} icon={<Grid2X2 size={18} />} label="Dashboard" onClick={() => setSection("dashboard")} />
          <SidebarButton active={section === "users"} icon={<UserRound size={18} />} label="Users" onClick={() => setSection("users")} />
          <SidebarButton active={section === "clients"} icon={<Smartphone size={18} />} label="Clients" onClick={() => setSection("clients")} />
          <SidebarButton active={section === "events"} icon={<Activity size={18} />} label="Auth Entries" onClick={() => setSection("events")} />
          <SidebarButton active={section === "config"} icon={<Settings size={18} />} label="Tenant Config" onClick={() => setSection("config")} />
        </nav>
        <div className="sidebarFooter">
          <button onClick={() => setSelectedTenant(null)}><LogOut size={18} /> Switch Tenant</button>
        </div>
      </aside>

      <section className="dashboardMain">
        <div className="pageHeader">
          <div>
            <h2>{sectionTitle(section)}</h2>
            <p>{sectionDescription(section)}</p>
          </div>
          <div className="headerActions">
            {notice}
            <button className="outlineButton" onClick={() => void refreshSelectedTenant()}><RefreshCw size={18} /></button>
          </div>
        </div>
        {section === "dashboard" && (
          <DashboardHome
            tenant={selectedTenant}
            users={users}
            clients={clients}
            events={events}
            setSection={setSection}
            openTenantEdit={() => {
              setSection("config");
              setTenantEditor(null);
            }}
          />
        )}
        {section === "users" && (
          <UsersSection
            users={users}
            selectedUser={selectedUser}
            selectedUserClients={selectedUserClients}
            selectedClient={selectedClient}
            userMode={userMode}
            userForm={userForm}
            clientMode={clientMode}
            clientForm={clientForm}
            openUser={openUser}
            startCreateUser={startCreateUser}
            saveUser={saveUser}
            deactivateUser={deactivateUser}
            setUserForm={setUserForm}
            updateEmbedding={updateEmbedding}
            addEmbedding={addEmbedding}
            removeEmbedding={removeEmbedding}
            startCreateClient={startCreateClient}
            openClient={openClient}
            saveClient={saveClient}
            deactivateClient={deactivateClient}
            setClientForm={setClientForm}
          />
        )}
        {section === "clients" && (
          <ClientsSection
            users={users}
            clients={clients}
            selectedClient={selectedClient}
            clientMode={clientMode}
            clientForm={clientForm}
            openClient={openClient}
            startCreateClient={startCreateClient}
            saveClient={saveClient}
            deactivateClient={deactivateClient}
            setClientForm={setClientForm}
          />
        )}
        {section === "events" && (
          <EventsSection events={events} selectedEvent={selectedEvent} setSelectedEvent={setSelectedEvent} />
        )}
        {section === "config" && (
          <section className="tableCard editorCard">
            <TenantConfigForm
              tenantForm={tenantForm}
              updateTenantForm={setTenantForm}
              updateModel={updateModel}
              updateLivenessChallenge={updateLivenessChallenge}
            />
            <div className="actions">
              <button className="primaryButton" onClick={() => void saveTenant()}><Save size={16} /> Save Tenant</button>
              <button className="dangerButton" onClick={() => void deactivateTenant(selectedTenant)}><Trash2 size={16} /> Deactivate</button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function sectionTitle(section: Section) {
  return {
    dashboard: "Dashboard",
    users: "Users",
    clients: "Clients",
    events: "Auth Entries",
    config: "Tenant Config"
  }[section];
}

function sectionDescription(section: Section) {
  return {
    dashboard: "Welcome to the tenant management dashboard",
    users: "Manage enrolled users and inspect their registered clients",
    clients: "Manage registered app clients across users",
    events: "Review authentication entries synced by the app",
    config: "Manage tenant model and liveness configuration"
  }[section];
}

function DashboardHome({
  tenant,
  users,
  clients,
  events,
  setSection,
  openTenantEdit
}: {
  tenant: Tenant;
  users: User[];
  clients: Client[];
  events: AuthEvent[];
  setSection: (section: Section) => void;
  openTenantEdit: () => void;
}) {
  return (
    <>
      <section className="tenantSummaryCard">
        <div className="tenantIcon"><Building2 size={34} /></div>
        <div className="tenantSummaryMain">
          <div className="tenantTitleLine">
            <h3>{tenant.name}</h3>
            <StatusPill status={tenant.status} />
            <button className="outlineButton small" onClick={openTenantEdit}><Edit3 size={16} /> Edit Tenant</button>
          </div>
          <p>{tenant.id}</p>
          <div className="tenantSummaryGrid">
            <Metric label="Model" value={tenant.configs.MODEL_CONFIG.modelVersion} />
            <Metric label="Embedding Dimension" value={tenant.configs.MODEL_CONFIG.embeddingDimension} />
            <Metric label="Created" value={shortDate(tenant.createdAt)} />
            <Metric label="Last Updated" value={shortDate(tenant.updatedAt)} />
          </div>
        </div>
      </section>

      <h3 className="sectionHeading">Quick Access</h3>
      <section className="quickGrid">
        <QuickCard icon={<UserRound size={28} />} label="Users" value={users.length} onClick={() => setSection("users")} />
        <QuickCard icon={<Smartphone size={28} />} label="Clients" value={clients.length} onClick={() => setSection("clients")} />
        <QuickCard icon={<Activity size={28} />} label="Auth Entries" value={events.length} onClick={() => setSection("events")} />
        <QuickCard icon={<Settings size={28} />} label="Tenant Config" value={tenant.status} onClick={() => setSection("config")} />
      </section>

      <h3 className="sectionHeading">Metrics</h3>
      <section className="metricsList">
        <MetricRow icon={<UserRound size={22} />} label="Active Users" value={users.filter((user) => user.status === "ACTIVE").length} onClick={() => setSection("users")} />
        <MetricRow icon={<Smartphone size={22} />} label="Active Clients" value={clients.filter((client) => client.status === "ACTIVE").length} onClick={() => setSection("clients")} />
        <MetricRow icon={<Database size={22} />} label="Synced Auth Entries" value={events.length} onClick={() => setSection("events")} />
      </section>
    </>
  );
}

function UsersSection(props: {
  users: User[];
  selectedUser: User | null;
  selectedUserClients: Client[];
  selectedClient: Client | null;
  userMode: "create" | "edit" | "view";
  userForm: UserForm;
  clientMode: "create" | "edit" | "view";
  clientForm: ClientForm;
  openUser: (user: User) => void;
  startCreateUser: () => void;
  saveUser: () => Promise<void>;
  deactivateUser: (user: User) => Promise<void>;
  setUserForm: (form: UserForm) => void;
  updateEmbedding: (index: number, patch: Partial<EmbeddingForm>) => void;
  addEmbedding: () => void;
  removeEmbedding: (index: number) => void;
  startCreateClient: (userId?: string) => void;
  openClient: (client: Client) => void;
  saveClient: () => Promise<void>;
  deactivateClient: (client: Client) => Promise<void>;
  setClientForm: (form: ClientForm) => void;
}) {
  return (
    <>
      <section className="tableCard">
        <div className="cardHeader">
          <h3>User Listing</h3>
          <button className="primaryButton" onClick={props.startCreateUser}><Plus size={16} /> Create User</button>
        </div>
        <DataTable
          headers={["User", "Employee", "Role", "Embeddings", "Status", "Actions"]}
          rows={props.users.map((user) => [
            <Identifier key="id" title={user.name} subtitle={user.username} />,
            user.employeeId,
            user.role || "-",
            user.embeddings.length,
            <StatusPill key="status" status={user.status} />,
            <div className="tableActions" key="actions">
              <button className="iconOnly" title="View user" onClick={() => props.openUser(user)}><Eye size={18} /></button>
              <button className="iconOnly" title="Edit user" onClick={() => props.openUser(user)}><Edit3 size={18} /></button>
              <button className="iconOnly dangerText" title="Deactivate user" onClick={() => void props.deactivateUser(user)}><Trash2 size={18} /></button>
            </div>
          ])}
          onRowClick={(index) => props.openUser(props.users[index])}
          emptyText="No users found."
        />
      </section>

      {(props.selectedUser || props.userMode === "create") && (
        <section className="detailLayout">
          <section className="tableCard editorCard">
            <div className="cardHeader">
              <h3>{props.userMode === "create" ? "Create User" : "User Detail"}</h3>
              {props.selectedUser && <StatusPill status={props.selectedUser.status} />}
            </div>
            {props.selectedUser && (
              <DetailGrid rows={[
                ["User ID", props.selectedUser.id],
                ["Tenant ID", props.selectedUser.tenantId],
                ["Created", shortDateTime(props.selectedUser.createdAt)],
                ["Updated", shortDateTime(props.selectedUser.updatedAt)]
              ]} />
            )}
            <UserFormView {...props} />
            <div className="actions">
              <button className="primaryButton" onClick={() => void props.saveUser()}><Save size={16} /> Save User</button>
              {props.selectedUser && <button className="dangerButton" onClick={() => void props.deactivateUser(props.selectedUser!)}><Trash2 size={16} /> Deactivate</button>}
            </div>
          </section>

          <section className="tableCard">
            <div className="cardHeader">
              <h3>Clients for {props.selectedUser?.name}</h3>
              <button className="primaryButton" onClick={() => props.startCreateClient(props.selectedUser?.id)}><Plus size={16} /> Register Client</button>
            </div>
            <DataTable
              headers={["Device", "Platform", "Status", "Updated", "Actions"]}
              rows={props.selectedUserClients.map((client) => [
                <Identifier key="id" title={client.deviceName} subtitle={client.clientId} />,
                `${client.platform} ${client.appVersion}`,
                <StatusPill key="status" status={client.status} />,
                shortDate(client.updatedAt),
                <div className="tableActions" key="actions">
                  <button className="iconOnly" title="View client" onClick={() => props.openClient(client)}><Eye size={18} /></button>
                  <button className="iconOnly dangerText" title="Deactivate client" onClick={() => void props.deactivateClient(client)}><CircleSlash size={18} /></button>
                </div>
              ])}
              onRowClick={(index) => props.openClient(props.selectedUserClients[index])}
              emptyText="No registered clients for this user."
            />
            {(props.selectedClient || props.clientMode === "create") && <ClientEditor {...props} users={props.selectedUser ? [props.selectedUser] : []} />}
          </section>
        </section>
      )}
    </>
  );
}

function ClientsSection(props: {
  users: User[];
  clients: Client[];
  selectedClient: Client | null;
  clientMode: "create" | "edit" | "view";
  clientForm: ClientForm;
  openClient: (client: Client) => void;
  startCreateClient: (userId?: string) => void;
  saveClient: () => Promise<void>;
  deactivateClient: (client: Client) => Promise<void>;
  setClientForm: (form: ClientForm) => void;
}) {
  return (
    <>
      <section className="tableCard">
        <div className="cardHeader">
          <h3>Client Listing</h3>
          <button className="primaryButton" onClick={() => props.startCreateClient()}><Plus size={16} /> Register Client</button>
        </div>
        <DataTable
          headers={["Device", "Client ID", "User", "Platform", "Status", "Actions"]}
          rows={props.clients.map((client) => [
            client.deviceName,
            shortId(client.clientId),
            props.users.find((user) => user.id === client.userId)?.name ?? client.userId,
            `${client.platform} ${client.appVersion}`,
            <StatusPill key="status" status={client.status} />,
            <div className="tableActions" key="actions">
              <button className="iconOnly" title="View client" onClick={() => props.openClient(client)}><Eye size={18} /></button>
              <button className="iconOnly dangerText" title="Deactivate client" onClick={() => void props.deactivateClient(client)}><Trash2 size={18} /></button>
            </div>
          ])}
          onRowClick={(index) => props.openClient(props.clients[index])}
          emptyText="No clients found."
        />
      </section>
      {(props.selectedClient || props.clientMode === "create") && <ClientEditor {...props} />}
    </>
  );
}

function EventsSection({ events, selectedEvent, setSelectedEvent }: { events: AuthEvent[]; selectedEvent: AuthEvent | null; setSelectedEvent: (event: AuthEvent) => void }) {
  return (
    <section className="detailLayout">
      <section className="tableCard">
        <DataTable
          headers={["Event", "Result", "Scores", "Latency", "Captured", "Purge"]}
          rows={events.map((event) => [
            <Identifier key="id" title={event.eventId} subtitle={event.clientId} />,
            <ResultPill key="result" result={event.result} />,
            `${event.faceScore} / ${event.livenessScore}`,
            `${event.latencyMs} ms`,
            shortDateTime(event.capturedAt),
            event.purgeStatus
          ])}
          onRowClick={(index) => setSelectedEvent(events[index])}
          emptyText="No auth entries found."
        />
      </section>
      <section className="tableCard editorCard">
        <div className="cardHeader"><h3>Auth Entry Detail</h3></div>
        {selectedEvent ? (
          <>
            <DetailGrid rows={[
              ["Event ID", selectedEvent.eventId],
              ["User ID", selectedEvent.userId],
              ["Client ID", selectedEvent.clientId],
              ["Result", <ResultPill result={selectedEvent.result} />],
              ["Failure", selectedEvent.failureReason || "-"],
              ["Challenges", selectedEvent.challengeTypes.join(", ") || "-"],
              ["Received", shortDateTime(selectedEvent.receivedAt)],
              ["Purge", selectedEvent.purgeStatus]
            ]} />
            <div className="vectorPreview">
              <span>Embedding</span>
              <div>{selectedEvent.embedding.map((value, index) => <code key={index}>{value}</code>)}</div>
            </div>
          </>
        ) : <Empty text="Select an auth entry to inspect details." />}
      </section>
    </section>
  );
}

function UserFormView(props: {
  userForm: UserForm;
  setUserForm: (form: UserForm) => void;
  updateEmbedding: (index: number, patch: Partial<EmbeddingForm>) => void;
  addEmbedding: () => void;
  removeEmbedding: (index: number) => void;
}) {
  return (
    <>
      <div className="formGrid twoCols">
        <Field label="Employee ID"><input value={props.userForm.employeeId} onChange={(event) => props.setUserForm({ ...props.userForm, employeeId: event.target.value })} /></Field>
        <Field label="Username"><input value={props.userForm.username} onChange={(event) => props.setUserForm({ ...props.userForm, username: event.target.value })} /></Field>
        <Field label="Password"><input type="password" value={props.userForm.password} placeholder="Keep blank to retain password" onChange={(event) => props.setUserForm({ ...props.userForm, password: event.target.value })} /></Field>
        <Field label="Name"><input value={props.userForm.name} onChange={(event) => props.setUserForm({ ...props.userForm, name: event.target.value })} /></Field>
        <Field label="Role"><input value={props.userForm.role} onChange={(event) => props.setUserForm({ ...props.userForm, role: event.target.value })} /></Field>
      </div>
      <div className="subsection">
        <div className="subsectionHeader spaceBetween">
          <span><Fingerprint size={16} /> Embeddings</span>
          <button className="outlineButton small" onClick={props.addEmbedding}><Plus size={14} /> Add</button>
        </div>
        <div className="embeddingRows">
          {props.userForm.embeddings.map((embedding, index) => (
            <div className="embeddingRow" key={`${embedding.id}-${index}`}>
              <input aria-label={`Embedding ${index + 1} id`} value={embedding.id} onChange={(event) => props.updateEmbedding(index, { id: event.target.value })} />
              <input aria-label={`Embedding ${index + 1} vector`} value={embedding.vectorText} onChange={(event) => props.updateEmbedding(index, { vectorText: event.target.value })} />
              <button className="iconOnly dangerText" onClick={() => props.removeEmbedding(index)} title="Remove embedding"><X size={16} /></button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ClientEditor(props: {
  users: User[];
  selectedClient: Client | null;
  clientMode: "create" | "edit" | "view";
  clientForm: ClientForm;
  saveClient: () => Promise<void>;
  deactivateClient: (client: Client) => Promise<void>;
  setClientForm: (form: ClientForm) => void;
}) {
  return (
    <div className="clientEditor">
      <div className="cardHeader compact"><h3>{props.clientMode === "create" ? "Register Client" : "Client Detail"}</h3></div>
      {props.selectedClient && (
        <DetailGrid rows={[
          ["Client ID", props.selectedClient.clientId],
          ["Internal ID", props.selectedClient.id],
          ["Activated", shortDateTime(props.selectedClient.activatedAt)],
          ["Updated", shortDateTime(props.selectedClient.updatedAt)]
        ]} />
      )}
      <div className="formGrid twoCols">
        <Field label="User">
          <select value={props.clientForm.userId} disabled={props.clientMode === "edit"} onChange={(event) => props.setClientForm({ ...props.clientForm, userId: event.target.value })}>
            <option value="">Select user</option>
            {props.users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.employeeId})</option>)}
          </select>
        </Field>
        <Field label="Device Type"><input value={props.clientForm.deviceType} onChange={(event) => props.setClientForm({ ...props.clientForm, deviceType: event.target.value })} /></Field>
        <Field label="Device Name"><input value={props.clientForm.deviceName} onChange={(event) => props.setClientForm({ ...props.clientForm, deviceName: event.target.value })} /></Field>
        <Field label="Platform"><input value={props.clientForm.platform} onChange={(event) => props.setClientForm({ ...props.clientForm, platform: event.target.value })} /></Field>
        <Field label="App Version"><input value={props.clientForm.appVersion} onChange={(event) => props.setClientForm({ ...props.clientForm, appVersion: event.target.value })} /></Field>
        <Field label="IMEI"><input value={props.clientForm.imei} onChange={(event) => props.setClientForm({ ...props.clientForm, imei: event.target.value })} /></Field>
        {props.clientMode === "edit" && (
          <Field label="Status">
            <select value={props.clientForm.status} onChange={(event) => props.setClientForm({ ...props.clientForm, status: event.target.value as Status })}>
              <option>ACTIVE</option>
              <option>INACTIVE</option>
            </select>
          </Field>
        )}
      </div>
      <div className="actions">
        <button className="primaryButton" onClick={() => void props.saveClient()}><Save size={16} /> Save Client</button>
        {props.selectedClient && <button className="dangerButton" onClick={() => void props.deactivateClient(props.selectedClient!)}><Trash2 size={16} /> Deactivate</button>}
      </div>
    </div>
  );
}

function TenantConfigForm({
  tenantForm,
  updateTenantForm,
  updateModel,
  updateLivenessChallenge
}: {
  tenantForm: TenantForm;
  updateTenantForm: (form: TenantForm) => void;
  updateModel: <K extends keyof ModelConfig>(key: K, value: ModelConfig[K]) => void;
  updateLivenessChallenge: (challenge: string) => void;
}) {
  return (
    <>
      <div className="formGrid twoCols">
        <Field label="Tenant name"><input value={tenantForm.name} onChange={(event) => updateTenantForm({ ...tenantForm, name: event.target.value })} /></Field>
        <Field label="Status">
          <select value={tenantForm.status} onChange={(event) => updateTenantForm({ ...tenantForm, status: event.target.value as Status })}>
            <option>ACTIVE</option>
            <option>INACTIVE</option>
          </select>
        </Field>
      </div>
      <div className="subsection">
        <div className="subsectionHeader"><KeyRound size={16} /> Model config</div>
        <div className="formGrid threeCols">
          <Field label="Model version"><input value={tenantForm.model.modelVersion} onChange={(event) => updateModel("modelVersion", event.target.value)} /></Field>
          <Field label="Face threshold"><input type="number" min="0" max="1" step="0.01" value={tenantForm.model.faceThreshold} onChange={(event) => updateModel("faceThreshold", Number(event.target.value))} /></Field>
          <Field label="Liveness threshold"><input type="number" min="0" max="1" step="0.01" value={tenantForm.model.livenessThreshold} onChange={(event) => updateModel("livenessThreshold", Number(event.target.value))} /></Field>
          <Field label="Embedding dimension"><input type="number" min="1" step="1" value={tenantForm.model.embeddingDimension} onChange={(event) => updateModel("embeddingDimension", Number(event.target.value))} /></Field>
          <Field label="Model checksum"><input value={tenantForm.model.modelChecksum} onChange={(event) => updateModel("modelChecksum", event.target.value)} /></Field>
          <Toggle label="Model active" checked={tenantForm.model.active} onChange={(checked) => updateModel("active", checked)} />
        </div>
      </div>
      <div className="subsection">
        <div className="subsectionHeader"><Fingerprint size={16} /> Liveness config</div>
        <div className="challengeRow">
          {challengeOptions.map((challenge) => (
            <button
              key={challenge}
              className={`chipButton ${tenantForm.liveness.challengeTypes.includes(challenge) ? "selected" : ""}`}
              onClick={() => updateLivenessChallenge(challenge)}
            >
              {challenge.replace("_", " ")}
            </button>
          ))}
        </div>
        <Toggle
          label="Liveness active"
          checked={tenantForm.liveness.active}
          onChange={(checked) => updateTenantForm({ ...tenantForm, liveness: { ...tenantForm.liveness, active: checked } })}
        />
      </div>
    </>
  );
}

function DataTable({ headers, rows, emptyText, onRowClick }: { headers: string[]; rows: ReactNode[][]; emptyText: string; onRowClick?: (index: number) => void }) {
  return (
    <>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={onRowClick ? "clickableRow" : ""} onClick={() => onRowClick?.(rowIndex)}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <Empty text={emptyText} />}
    </>
  );
}

function Identifier({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <span className="identifier">
      <strong>{title}</strong>
      <small>{subtitle}</small>
    </span>
  );
}

function SidebarButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={`sidebarButton ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function StatusPill({ status }: { status: Status }) {
  return <span className={`pill ${status === "ACTIVE" ? "success" : "muted"}`}>{status}</span>;
}

function ResultPill({ result }: { result: string }) {
  return <span className={`pill ${result.toUpperCase() === "SUCCESS" ? "success" : "error"}`}>{result}</span>;
}

function QuickCard({ icon, label, value, onClick }: { icon: ReactNode; label: string; value: ReactNode; onClick: () => void }) {
  return (
    <button className="quickCard" onClick={onClick}>
      <span>{icon}</span>
      <strong>{label}</strong>
      <small>{value}</small>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="summaryMetric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricRow({ icon, label, value, onClick }: { icon: ReactNode; label: string; value: ReactNode; onClick: () => void }) {
  return (
    <button className="metricRow" onClick={onClick}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
      <Eye size={16} />
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggleField">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function DetailGrid({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="detailGrid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
