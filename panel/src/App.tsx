import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Building2,
  CheckCircle2,
  CircleSlash,
  Edit3,
  Eye,
  Fingerprint,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  X
} from "lucide-react";

type Status = "ACTIVE" | "INACTIVE";

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
    .map((row, index) => {
      const vector = row.vectorText
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((value) => !Number.isNaN(value));
      return {
        id: row.id.trim() || `embedding-${index + 1}`,
        vector
      };
    });
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
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuthEvent | null>(null);
  const [tenantForm, setTenantForm] = useState<TenantForm>(createTenantForm());
  const [userForm, setUserForm] = useState<UserForm>(createUserForm());
  const [clientForm, setClientForm] = useState<ClientForm>(createClientForm());
  const [tenantMode, setTenantMode] = useState<"create" | "edit">("create");
  const [userMode, setUserMode] = useState<"create" | "edit">("create");
  const [clientMode, setClientMode] = useState<"create" | "edit">("create");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const activeUsers = users.filter((user) => user.status === "ACTIVE").length;
  const activeClients = clients.filter((client) => client.status === "ACTIVE").length;
  const selectedUserClients = useMemo(
    () => clients.filter((client) => client.userId === selectedUser?.id),
    [clients, selectedUser]
  );
  const visibleEvents = useMemo(() => {
    if (selectedClient) return events.filter((event) => event.clientId === selectedClient.clientId);
    if (selectedUser) return events.filter((event) => event.userId === selectedUser.id);
    return events;
  }, [events, selectedClient, selectedUser]);
  const filteredTenants = useMemo(() => {
    const query = tenantSearch.trim().toLowerCase();
    if (!query) return tenants;
    return tenants.filter((tenant) => `${tenant.name} ${tenant.id} ${tenant.status}`.toLowerCase().includes(query));
  }, [tenantSearch, tenants]);

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
      if (selectedTenant) {
        const refreshed = data.tenants.find((tenant) => tenant.id === selectedTenant.id) ?? null;
        setSelectedTenant(refreshed);
      }
    });
  }

  async function selectTenant(tenant: Tenant) {
    await run(async () => {
      const detail = await api<Tenant>(`/api/tenants/${tenant.id}`);
      setSelectedTenant(detail);
      setTenantMode("edit");
      setTenantForm(createTenantForm(detail));
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
    if (selectedUser) {
      setSelectedUser(nextUsers.find((user) => user.id === selectedUser.id) ?? selectedUser);
    }
    if (selectedClient) {
      setSelectedClient(nextClients.find((client) => client.clientId === selectedClient.clientId) ?? selectedClient);
    }
  }

  async function saveTenant() {
    await run(async () => {
      const configs = toTenantConfig(tenantForm);
      if (tenantMode === "create") {
        const tenant = await api<Tenant>("/api/tenants", {
          method: "POST",
          body: JSON.stringify({ name: tenantForm.name, configs })
        });
        setMessage("Tenant created");
        await loadTenants();
        await selectTenant(tenant);
      } else if (selectedTenant) {
        const tenant = await api<Tenant>(
          "/api/tenant",
          {
            method: "PUT",
            body: JSON.stringify({ name: tenantForm.name, status: tenantForm.status, configs })
          },
          selectedTenant.id
        );
        setMessage("Tenant updated");
        await loadTenants();
        await selectTenant(tenant);
      }
    });
  }

  async function deactivateTenant() {
    if (!selectedTenant) return;
    await run(async () => {
      await api<Tenant>("/api/tenant", { method: "DELETE" }, selectedTenant.id);
      setMessage("Tenant deactivated");
      await loadTenants();
      await selectTenant(selectedTenant);
    });
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
        setSelectedEvent(null);
      }
      await refreshSelectedTenant();
    });
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

  function startCreateTenant() {
    setTenantMode("create");
    setTenantForm(createTenantForm());
    setSelectedTenant(null);
    setSelectedUser(null);
    setSelectedClient(null);
    setSelectedEvent(null);
    setUsers([]);
    setClients([]);
    setEvents([]);
  }

  function startCreateUser() {
    setUserMode("create");
    setUserForm(createUserForm());
    setSelectedUser(null);
    setSelectedClient(null);
    setSelectedEvent(null);
    setClientMode("create");
    setClientForm(createClientForm());
  }

  function editUser(user: User) {
    setSelectedUser(user);
    setUserMode("edit");
    setUserForm(createUserForm(user));
    setClientMode("create");
    setClientForm(createClientForm(user.id));
    setSelectedClient(null);
    setSelectedEvent(null);
  }

  function editClient(client: Client) {
    setSelectedClient(client);
    setClientMode("edit");
    setClientForm(createClientForm(client.userId, client));
    setSelectedEvent(null);
  }

  function startCreateClient() {
    setClientMode("create");
    setClientForm(createClientForm(selectedUser?.id ?? users[0]?.id ?? ""));
    setSelectedClient(null);
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

  return (
    <main className="appShell">
      <aside className="sideNav">
        <div className="brandBlock">
          <ShieldCheck size={28} />
          <div>
            <h1>Face Auth</h1>
            <p>Management Panel</p>
          </div>
        </div>

        <button className="primaryNavAction" onClick={startCreateTenant}>
          <Plus size={16} />
          Create tenant
        </button>

        <div className="tenantSearch">
          <Search size={15} />
          <input
            aria-label="Search tenants"
            placeholder="Search tenants"
            value={tenantSearch}
            onChange={(event) => setTenantSearch(event.target.value)}
          />
        </div>

        <div className="navSectionLabel">Tenants</div>
        <div className="tenantNavList">
          {filteredTenants.map((tenant) => (
            <button
              key={tenant.id}
              className={`tenantNavItem ${selectedTenant?.id === tenant.id ? "selected" : ""}`}
              onClick={() => void selectTenant(tenant)}
            >
              <Building2 size={17} />
              <span>
                <strong>{tenant.name}</strong>
                <small>{shortId(tenant.id)}</small>
              </span>
              <StatusPill status={tenant.status} />
            </button>
          ))}
          {filteredTenants.length === 0 && <div className="navEmpty">No tenants found</div>}
        </div>
      </aside>

      <section className="mainPane">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">No-auth local admin</p>
            <h2>{selectedTenant ? selectedTenant.name : "Tenant Operations"}</h2>
            <p className="headerMeta">
              {selectedTenant
                ? `Tenant ${selectedTenant.id} · updated ${shortDate(selectedTenant.updatedAt)}`
                : "Create or select a tenant to manage users, devices, and auth entries."}
            </p>
          </div>
          <div className="headerActions">
            {(message || error || loading) && (
              <div className={`inlineNotice ${error ? "error" : ""}`}>
                {loading && <Loader2 className="spin" size={16} />}
                {error || message || "Working..."}
              </div>
            )}
            <button className="iconButton" onClick={() => void loadTenants()} title="Refresh tenants">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        <section className="metricStrip">
          <Metric label="Tenants" value={tenants.length} />
          <Metric label="Users" value={users.length} hint={`${activeUsers} active`} />
          <Metric label="Clients" value={clients.length} hint={`${activeClients} active`} />
          <Metric label="Auth entries" value={events.length} hint={selectedTenant ? "tenant scoped" : "select tenant"} />
        </section>

        <section className="contentGrid">
          <Panel
            title={tenantMode === "create" ? "Create Tenant" : "Tenant Detail"}
            icon={<Building2 size={18} />}
            action={tenantMode === "edit" && selectedTenant ? <StatusPill status={selectedTenant.status} /> : undefined}
          >
            <div className="formGrid twoCols">
              <Field label="Tenant name">
                <input value={tenantForm.name} onChange={(event) => setTenantForm({ ...tenantForm, name: event.target.value })} />
              </Field>
              {tenantMode === "edit" && (
                <Field label="Status">
                  <select value={tenantForm.status} onChange={(event) => setTenantForm({ ...tenantForm, status: event.target.value as Status })}>
                    <option>ACTIVE</option>
                    <option>INACTIVE</option>
                  </select>
                </Field>
              )}
            </div>

            <div className="subsection">
              <div className="subsectionHeader">
                <KeyRound size={16} />
                <span>Model config</span>
              </div>
              <div className="formGrid threeCols">
                <Field label="Model version">
                  <input value={tenantForm.model.modelVersion} onChange={(event) => updateModel("modelVersion", event.target.value)} />
                </Field>
                <Field label="Face threshold">
                  <input type="number" min="0" max="1" step="0.01" value={tenantForm.model.faceThreshold} onChange={(event) => updateModel("faceThreshold", Number(event.target.value))} />
                </Field>
                <Field label="Liveness threshold">
                  <input type="number" min="0" max="1" step="0.01" value={tenantForm.model.livenessThreshold} onChange={(event) => updateModel("livenessThreshold", Number(event.target.value))} />
                </Field>
                <Field label="Embedding dimension">
                  <input type="number" min="1" step="1" value={tenantForm.model.embeddingDimension} onChange={(event) => updateModel("embeddingDimension", Number(event.target.value))} />
                </Field>
                <Field label="Model checksum">
                  <input value={tenantForm.model.modelChecksum} onChange={(event) => updateModel("modelChecksum", event.target.value)} />
                </Field>
                <Toggle
                  label="Model active"
                  checked={tenantForm.model.active}
                  onChange={(checked) => updateModel("active", checked)}
                />
              </div>
            </div>

            <div className="subsection">
              <div className="subsectionHeader">
                <Fingerprint size={16} />
                <span>Liveness config</span>
              </div>
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
                onChange={(checked) => setTenantForm((prev) => ({ ...prev, liveness: { ...prev.liveness, active: checked } }))}
              />
            </div>

            <div className="actions">
              <button onClick={() => void saveTenant()}>
                {tenantMode === "create" ? <CheckCircle2 size={16} /> : <Save size={16} />}
                {tenantMode === "create" ? "Create tenant" : "Save tenant"}
              </button>
              {tenantMode === "edit" && (
                <button className="danger" onClick={() => void deactivateTenant()}>
                  <Trash2 size={16} />
                  Deactivate
                </button>
              )}
            </div>
          </Panel>

          <Panel title="Tenant Snapshot" icon={<Activity size={18} />}>
            {selectedTenant ? (
              <DetailGrid
                rows={[
                  ["Tenant ID", selectedTenant.id],
                  ["Status", <StatusPill status={selectedTenant.status} />],
                  ["Model", selectedTenant.configs.MODEL_CONFIG.modelVersion],
                  ["Face threshold", selectedTenant.configs.MODEL_CONFIG.faceThreshold],
                  ["Liveness", selectedTenant.configs.LIVENESS_CONFIG.challengeTypes.join(", ")],
                  ["Created", shortDate(selectedTenant.createdAt)]
                ]}
              />
            ) : (
              <Empty text="Select a tenant from the left or create a new one." />
            )}
          </Panel>
        </section>

        {selectedTenant && (
          <>
            <section className="sectionBand">
              <div className="bandHeader">
                <div>
                  <h3>Users</h3>
                  <p>Enrollment records and embeddings for the selected tenant.</p>
                </div>
                <button className="secondaryButton" onClick={startCreateUser}>
                  <Plus size={16} />
                  New user
                </button>
              </div>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Employee</th>
                      <th>Role</th>
                      <th>Embeddings</th>
                      <th>Status</th>
                      <th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className={selectedUser?.id === user.id ? "selectedRow" : ""}>
                        <td>
                          <button className="tableLink" onClick={() => editUser(user)}>
                            {user.name}
                            <small>{user.username}</small>
                          </button>
                        </td>
                        <td>{user.employeeId}</td>
                        <td>{user.role || "-"}</td>
                        <td>{user.embeddings.length}</td>
                        <td><StatusPill status={user.status} /></td>
                        <td>
                          <div className="rowActions">
                            <button className="iconButton" onClick={() => editUser(user)} title="View user"><Eye size={15} /></button>
                            <button className="iconButton" onClick={() => editUser(user)} title="Edit user"><Edit3 size={15} /></button>
                            <button className="iconButton dangerText" onClick={() => void deactivateUser(user)} title="Deactivate user"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && <Empty text="No users enrolled for this tenant." />}
              </div>
            </section>

            <section className="contentGrid userClientGrid">
              <Panel title={userMode === "create" ? "Create User" : "User Detail"} icon={<UserRound size={18} />}>
                <UserDetail user={selectedUser} />
                <div className="formGrid twoCols">
                  <Field label="Employee ID">
                    <input value={userForm.employeeId} onChange={(event) => setUserForm({ ...userForm, employeeId: event.target.value })} />
                  </Field>
                  <Field label="Username">
                    <input value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} />
                  </Field>
                  <Field label="Password">
                    <input
                      type="password"
                      value={userForm.password}
                      placeholder={userMode === "edit" ? "Keep blank to retain password" : ""}
                      onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                    />
                  </Field>
                  <Field label="Name">
                    <input value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} />
                  </Field>
                  <Field label="Role">
                    <input value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })} />
                  </Field>
                </div>

                <div className="subsection">
                  <div className="subsectionHeader spaceBetween">
                    <span><Fingerprint size={16} /> Embeddings</span>
                    <button className="tinyButton" onClick={addEmbedding}><Plus size={14} /> Add</button>
                  </div>
                  <div className="embeddingRows">
                    {userForm.embeddings.map((embedding, index) => (
                      <div className="embeddingRow" key={`${embedding.id}-${index}`}>
                        <input
                          aria-label={`Embedding ${index + 1} id`}
                          value={embedding.id}
                          onChange={(event) => updateEmbedding(index, { id: event.target.value })}
                          placeholder="embedding id"
                        />
                        <input
                          aria-label={`Embedding ${index + 1} vector`}
                          value={embedding.vectorText}
                          onChange={(event) => updateEmbedding(index, { vectorText: event.target.value })}
                          placeholder="0.1, 0.2, 0.3"
                        />
                        <button className="iconButton dangerText" onClick={() => removeEmbedding(index)} title="Remove embedding">
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="actions">
                  <button onClick={() => void saveUser()}>
                    {userMode === "create" ? <CheckCircle2 size={16} /> : <Save size={16} />}
                    {userMode === "create" ? "Create user" : "Save user"}
                  </button>
                  {selectedUser && (
                    <button className="danger" onClick={() => void deactivateUser(selectedUser)}>
                      <Trash2 size={16} />
                      Deactivate
                    </button>
                  )}
                </div>
              </Panel>

              <Panel
                title={selectedUser ? `Clients for ${selectedUser.name}` : "Client Devices"}
                icon={<Smartphone size={18} />}
                action={<button className="tinyButton" disabled={!users.length} onClick={startCreateClient}><Plus size={14} /> Register</button>}
              >
                {selectedUser ? (
                  <div className="miniTable">
                    {selectedUserClients.map((client) => (
                      <button className={`deviceRow ${selectedClient?.clientId === client.clientId ? "selected" : ""}`} key={client.clientId} onClick={() => editClient(client)}>
                        <Smartphone size={16} />
                        <span>
                          <strong>{client.deviceName}</strong>
                          <small>{client.platform} {client.appVersion} · {shortId(client.clientId)}</small>
                        </span>
                        <StatusPill status={client.status} />
                      </button>
                    ))}
                    {selectedUserClients.length === 0 && <Empty text="No registered clients for this user." />}
                  </div>
                ) : (
                  <Empty text="Select a user to see registered clients." />
                )}

                <div className="subsection">
                  <div className="subsectionHeader">
                    <Smartphone size={16} />
                    <span>{clientMode === "create" ? "Register Client" : "Client Detail"}</span>
                  </div>
                  <ClientDetail client={selectedClient} />
                  <div className="formGrid twoCols">
                    <Field label="User">
                      <select value={clientForm.userId} onChange={(event) => setClientForm({ ...clientForm, userId: event.target.value })} disabled={clientMode === "edit"}>
                        <option value="">Select user</option>
                        {users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.employeeId})</option>)}
                      </select>
                    </Field>
                    <Field label="Device type">
                      <input value={clientForm.deviceType} onChange={(event) => setClientForm({ ...clientForm, deviceType: event.target.value })} />
                    </Field>
                    <Field label="Device name">
                      <input value={clientForm.deviceName} onChange={(event) => setClientForm({ ...clientForm, deviceName: event.target.value })} />
                    </Field>
                    <Field label="Platform">
                      <input value={clientForm.platform} onChange={(event) => setClientForm({ ...clientForm, platform: event.target.value })} />
                    </Field>
                    <Field label="App version">
                      <input value={clientForm.appVersion} onChange={(event) => setClientForm({ ...clientForm, appVersion: event.target.value })} />
                    </Field>
                    <Field label="IMEI">
                      <input value={clientForm.imei} onChange={(event) => setClientForm({ ...clientForm, imei: event.target.value })} />
                    </Field>
                    {clientMode === "edit" && (
                      <Field label="Status">
                        <select value={clientForm.status} onChange={(event) => setClientForm({ ...clientForm, status: event.target.value as Status })}>
                          <option>ACTIVE</option>
                          <option>INACTIVE</option>
                        </select>
                      </Field>
                    )}
                  </div>
                  <div className="actions">
                    <button onClick={() => void saveClient()}>
                      {clientMode === "create" ? <CheckCircle2 size={16} /> : <Save size={16} />}
                      {clientMode === "create" ? "Register client" : "Save client"}
                    </button>
                    {selectedClient && (
                      <button className="danger" onClick={() => void deactivateClient(selectedClient)}>
                        <CircleSlash size={16} />
                        Deactivate
                      </button>
                    )}
                  </div>
                </div>
              </Panel>
            </section>

            <section className="sectionBand">
              <div className="bandHeader">
                <div>
                  <h3>{selectedClient ? `Auth Entries for ${selectedClient.deviceName}` : selectedUser ? `Auth Entries for ${selectedUser.name}` : "Auth Entries"}</h3>
                  <p>Synced app authentication attempts and purge state.</p>
                </div>
              </div>
              <div className="eventLayout">
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Result</th>
                        <th>Scores</th>
                        <th>Latency</th>
                        <th>Captured</th>
                        <th>Purge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEvents.map((event) => (
                        <tr key={event.id} className={selectedEvent?.id === event.id ? "selectedRow" : ""} onClick={() => setSelectedEvent(event)}>
                          <td>
                            <button className="tableLink" onClick={() => setSelectedEvent(event)}>
                              {event.eventId}
                              <small>{event.clientId}</small>
                            </button>
                          </td>
                          <td><ResultPill result={event.result} /></td>
                          <td>{event.faceScore} / {event.livenessScore}</td>
                          <td>{event.latencyMs} ms</td>
                          <td>{shortDate(event.capturedAt)}</td>
                          <td>{event.purgeStatus}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {visibleEvents.length === 0 && <Empty text="No auth entries synced for this selection." />}
                </div>
                <aside className="eventDetail">
                  {selectedEvent ? (
                    <>
                      <h4>Event detail</h4>
                      <DetailGrid
                        rows={[
                          ["Event ID", selectedEvent.eventId],
                          ["User ID", selectedEvent.userId],
                          ["Client ID", selectedEvent.clientId],
                          ["Result", <ResultPill result={selectedEvent.result} />],
                          ["Failure", selectedEvent.failureReason || "-"],
                          ["Face score", selectedEvent.faceScore],
                          ["Liveness score", selectedEvent.livenessScore],
                          ["Challenges", selectedEvent.challengeTypes.join(", ") || "-"],
                          ["Received", shortDate(selectedEvent.receivedAt)],
                          ["Purge", selectedEvent.purgeStatus]
                        ]}
                      />
                      <div className="vectorPreview">
                        <span>Embedding</span>
                        <div>{selectedEvent.embedding.map((value, index) => <code key={index}>{value}</code>)}</div>
                      </div>
                    </>
                  ) : (
                    <Empty text="Select an auth entry to view its details." />
                  )}
                </aside>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function StatusPill({ status }: { status: Status }) {
  return <span className={`pill ${status === "ACTIVE" ? "success" : "muted"}`}>{status}</span>;
}

function ResultPill({ result }: { result: string }) {
  const normalized = result.toUpperCase();
  return <span className={`pill ${normalized === "SUCCESS" ? "success" : "error"}`}>{result}</span>;
}

function Panel({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <h3>{icon}{title}</h3>
        {action}
      </div>
      <div className="panelBody">{children}</div>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
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

function UserDetail({ user }: { user: User | null }) {
  if (!user) return <Empty text="Create a user or select a row to view full user details." />;
  return (
    <DetailGrid
      rows={[
        ["User ID", user.id],
        ["Tenant ID", user.tenantId],
        ["Status", <StatusPill status={user.status} />],
        ["Embeddings", user.embeddings.length],
        ["Created", shortDate(user.createdAt)],
        ["Updated", shortDate(user.updatedAt)]
      ]}
    />
  );
}

function ClientDetail({ client }: { client: Client | null }) {
  if (!client) return <Empty text="Register a client or select a client to inspect details." />;
  return (
    <DetailGrid
      rows={[
        ["Client ID", client.clientId],
        ["Internal ID", client.id],
        ["Status", <StatusPill status={client.status} />],
        ["Activated", shortDate(client.activatedAt)],
        ["Deactivated", shortDate(client.deactivatedAt)],
        ["Updated", shortDate(client.updatedAt)]
      ]}
    />
  );
}
