import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Building2,
  CheckCircle2,
  CircleSlash,
  Edit3,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
  UserRound
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
  configsText: string;
};

type UserForm = {
  employeeId: string;
  username: string;
  password: string;
  name: string;
  role: string;
  embeddingsText: string;
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

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function shortDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function createTenantForm(tenant?: Tenant): TenantForm {
  return {
    name: tenant?.name ?? "",
    status: tenant?.status ?? "ACTIVE",
    configsText: pretty(tenant?.configs ?? defaultConfig)
  };
}

function createUserForm(user?: User): UserForm {
  return {
    employeeId: user?.employeeId ?? "",
    username: user?.username ?? "",
    password: "",
    name: user?.name ?? "",
    role: user?.role ?? "",
    embeddingsText: pretty(user?.embeddings ?? defaultEmbeddings)
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
  const [loading, setLoading] = useState(false);

  const selectedTenantId = selectedTenant?.id ?? "";
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
      const configs = JSON.parse(tenantForm.configsText) as TenantConfig;
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
      const embeddings = JSON.parse(userForm.embeddingsText) as Embedding[];
      const payload = {
        employeeId: userForm.employeeId,
        username: userForm.username,
        password: userForm.password,
        name: userForm.name,
        role: userForm.role,
        embeddings
      };
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
      if (selectedUser?.id === user.id) setSelectedUser(null);
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
  }

  function startCreateUser() {
    setUserMode("create");
    setUserForm(createUserForm());
    setSelectedUser(null);
    setSelectedClient(null);
    setSelectedEvent(null);
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
    setClientForm(createClientForm(selectedUser?.id ?? ""));
    setSelectedClient(null);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Face Auth Admin Panel</h1>
          <p>No-auth demo operations for tenants, enrolled users, client devices, and auth events.</p>
        </div>
        <button className="iconButton" onClick={() => void loadTenants()} title="Refresh tenants">
          <RefreshCw size={18} />
        </button>
      </header>

      {(message || error || loading) && (
        <div className={`notice ${error ? "error" : ""}`}>
          {loading && <Loader2 className="spin" size={16} />}
          {error || message || "Working..."}
        </div>
      )}

      <section className="workspace">
        <aside className="sidebar">
          <div className="sectionHeader">
            <h2><Building2 size={18} /> Tenants</h2>
            <button className="smallButton" onClick={startCreateTenant}><Plus size={15} /> New</button>
          </div>
          <div className="list">
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                className={`listRow ${selectedTenant?.id === tenant.id ? "selected" : ""}`}
                onClick={() => void selectTenant(tenant)}
              >
                <span>
                  <strong>{tenant.name}</strong>
                  <small>{tenant.id}</small>
                </span>
                <StatusPill status={tenant.status} />
              </button>
            ))}
          </div>
        </aside>

        <section className="content">
          <div className="grid two">
            <Panel title={tenantMode === "create" ? "Create Tenant" : "Tenant Detail"} icon={<Building2 size={18} />}>
              <label>Name<input value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })} /></label>
              {tenantMode === "edit" && (
                <label>Status
                  <select value={tenantForm.status} onChange={(e) => setTenantForm({ ...tenantForm, status: e.target.value as Status })}>
                    <option>ACTIVE</option>
                    <option>INACTIVE</option>
                  </select>
                </label>
              )}
              <label>Config JSON<textarea rows={11} value={tenantForm.configsText} onChange={(e) => setTenantForm({ ...tenantForm, configsText: e.target.value })} /></label>
              <div className="actions">
                <button onClick={() => void saveTenant()}><CheckCircle2 size={16} /> {tenantMode === "create" ? "Create" : "Save"}</button>
                {tenantMode === "edit" && <button className="danger" onClick={() => void deactivateTenant()}><Trash2 size={16} /> Deactivate</button>}
              </div>
            </Panel>

            <Panel title="Tenant Snapshot" icon={<Activity size={18} />}>
              {selectedTenant ? (
                <dl className="stats">
                  <dt>Tenant ID</dt><dd>{selectedTenant.id}</dd>
                  <dt>Users</dt><dd>{users.length}</dd>
                  <dt>Clients</dt><dd>{clients.length}</dd>
                  <dt>Auth Events</dt><dd>{events.length}</dd>
                  <dt>Updated</dt><dd>{shortDate(selectedTenant.updatedAt)}</dd>
                </dl>
              ) : <Empty text="Select a tenant or create a new one." />}
            </Panel>
          </div>

          {selectedTenant && (
            <>
              <div className="grid two uneven">
                <Panel title="Users" icon={<UserRound size={18} />} action={<button className="smallButton" onClick={startCreateUser}><Plus size={15} /> New User</button>}>
                  <div className="table">
                    <div className="tableHead userCols"><span>Name</span><span>Employee</span><span>Status</span><span></span></div>
                    {users.map((user) => (
                      <div className="tableRow userCols" key={user.id}>
                        <button className="linkCell" onClick={() => editUser(user)}>{user.name}<small>{user.username}</small></button>
                        <span>{user.employeeId}</span>
                        <StatusPill status={user.status} />
                        <div className="rowActions">
                          <button className="iconButton" onClick={() => editUser(user)} title="View user"><Eye size={15} /></button>
                          <button className="iconButton" onClick={() => editUser(user)} title="Edit user"><Edit3 size={15} /></button>
                          <button className="iconButton dangerText" onClick={() => void deactivateUser(user)} title="Deactivate user"><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title={userMode === "create" ? "Create User" : "User Detail"} icon={<UserRound size={18} />}>
                  <UserDetail user={selectedUser} />
                  <label>Employee ID<input value={userForm.employeeId} onChange={(e) => setUserForm({ ...userForm, employeeId: e.target.value })} /></label>
                  <label>Username<input value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} /></label>
                  <label>Password<input type="password" value={userForm.password} placeholder={userMode === "edit" ? "Leave blank only if not changing backend password" : ""} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} /></label>
                  <label>Name<input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} /></label>
                  <label>Role<input value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} /></label>
                  <label>Embeddings JSON<textarea rows={6} value={userForm.embeddingsText} onChange={(e) => setUserForm({ ...userForm, embeddingsText: e.target.value })} /></label>
                  <div className="actions">
                    <button onClick={() => void saveUser()}><CheckCircle2 size={16} /> {userMode === "create" ? "Create" : "Save"}</button>
                    {selectedUser && <button className="danger" onClick={() => void deactivateUser(selectedUser)}><Trash2 size={16} /> Deactivate</button>}
                  </div>
                </Panel>
              </div>

              {selectedUser && (
                <div className="grid two uneven">
                  <Panel title={`Clients for ${selectedUser.name}`} icon={<Smartphone size={18} />} action={<button className="smallButton" onClick={startCreateClient}><Plus size={15} /> Register Client</button>}>
                    <div className="table">
                      <div className="tableHead clientCols"><span>Device</span><span>Platform</span><span>Status</span><span></span></div>
                      {selectedUserClients.map((client) => (
                        <div className="tableRow clientCols" key={client.clientId}>
                          <button className="linkCell" onClick={() => editClient(client)}>{client.deviceName}<small>{client.clientId}</small></button>
                          <span>{client.platform} {client.appVersion}</span>
                          <StatusPill status={client.status} />
                          <div className="rowActions">
                            <button className="iconButton" onClick={() => editClient(client)} title="View client"><Eye size={15} /></button>
                            <button className="iconButton dangerText" onClick={() => void deactivateClient(client)} title="Deactivate client"><CircleSlash size={15} /></button>
                          </div>
                        </div>
                      ))}
                      {selectedUserClients.length === 0 && <Empty text="No registered clients for this user." />}
                    </div>
                  </Panel>

                  <Panel title={clientMode === "create" ? "Register Client" : "Client Detail"} icon={<Smartphone size={18} />}>
                    <ClientDetail client={selectedClient} />
                    <label>User
                      <select value={clientForm.userId} onChange={(e) => setClientForm({ ...clientForm, userId: e.target.value })} disabled={clientMode === "edit"}>
                        {users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.employeeId})</option>)}
                      </select>
                    </label>
                    <label>Device Type<input value={clientForm.deviceType} onChange={(e) => setClientForm({ ...clientForm, deviceType: e.target.value })} /></label>
                    <label>Device Name<input value={clientForm.deviceName} onChange={(e) => setClientForm({ ...clientForm, deviceName: e.target.value })} /></label>
                    <label>Platform<input value={clientForm.platform} onChange={(e) => setClientForm({ ...clientForm, platform: e.target.value })} /></label>
                    <label>App Version<input value={clientForm.appVersion} onChange={(e) => setClientForm({ ...clientForm, appVersion: e.target.value })} /></label>
                    <label>IMEI<input value={clientForm.imei} onChange={(e) => setClientForm({ ...clientForm, imei: e.target.value })} /></label>
                    {clientMode === "edit" && (
                      <label>Status
                        <select value={clientForm.status} onChange={(e) => setClientForm({ ...clientForm, status: e.target.value as Status })}>
                          <option>ACTIVE</option>
                          <option>INACTIVE</option>
                        </select>
                      </label>
                    )}
                    <div className="actions">
                      <button onClick={() => void saveClient()}><CheckCircle2 size={16} /> {clientMode === "create" ? "Register" : "Save"}</button>
                      {selectedClient && <button className="danger" onClick={() => void deactivateClient(selectedClient)}><Trash2 size={16} /> Deactivate</button>}
                    </div>
                  </Panel>
                </div>
              )}

              <Panel title={selectedClient ? `Auth Entries for ${selectedClient.deviceName}` : selectedUser ? `Auth Entries for ${selectedUser.name}` : "Tenant Auth Entries"} icon={<Activity size={18} />}>
                <div className="table">
                  <div className="tableHead eventCols"><span>Event</span><span>Result</span><span>Scores</span><span>Captured</span><span>Purge</span></div>
                  {visibleEvents.map((event) => (
                    <button className="tableRow eventCols clickable" key={event.id} onClick={() => setSelectedEvent(event)}>
                      <span>{event.eventId}<small>{event.clientId}</small></span>
                      <strong>{event.result}</strong>
                      <span>{event.faceScore} / {event.livenessScore}</span>
                      <span>{shortDate(event.capturedAt)}</span>
                      <span>{event.purgeStatus}</span>
                    </button>
                  ))}
                  {visibleEvents.length === 0 && <Empty text="No auth events synced for the current selection." />}
                </div>
                {selectedEvent && <pre className="jsonView">{pretty(selectedEvent)}</pre>}
              </Panel>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function StatusPill({ status }: { status: Status }) {
  return <span className={`pill ${status === "ACTIVE" ? "active" : "inactive"}`}>{status}</span>;
}

function Panel({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <h2>{icon}{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

function UserDetail({ user }: { user: User | null }) {
  if (!user) return <Empty text="Create a user or select a row to view full user details." />;
  return (
    <dl className="detail">
      <dt>User ID</dt><dd>{user.id}</dd>
      <dt>Status</dt><dd><StatusPill status={user.status} /></dd>
      <dt>Embeddings</dt><dd>{user.embeddings.length}</dd>
      <dt>Updated</dt><dd>{shortDate(user.updatedAt)}</dd>
    </dl>
  );
}

function ClientDetail({ client }: { client: Client | null }) {
  if (!client) return <Empty text="Register a client or select a client to inspect details." />;
  return (
    <dl className="detail">
      <dt>Client ID</dt><dd>{client.clientId}</dd>
      <dt>Status</dt><dd><StatusPill status={client.status} /></dd>
      <dt>Activated</dt><dd>{shortDate(client.activatedAt)}</dd>
      <dt>Deactivated</dt><dd>{shortDate(client.deactivatedAt)}</dd>
    </dl>
  );
}
