import { FormEvent, useEffect, useState } from "react";
import { advanceTicks, loadDashboardData, registerHabitat, setModuleStatus, unregisterHabitat } from "./api";
import type { HabitatModule, SolarResponse, StateResponse, StatusResponse, TickSummary } from "./types";

type DashboardData = {
  status: StatusResponse;
  state: StateResponse;
  solar: SolarResponse;
};

type ThemeMode = "system" | "light" | "dark";

function getModuleStatus(module: HabitatModule) {
  const value = module.runtimeAttributes.status;
  return typeof value === "string" && value.length > 0 ? value : "idle";
}

function getPowerDrawKw(module: HabitatModule) {
  const runtimeAttributes = module.runtimeAttributes;
  const raw = runtimeAttributes.powerDrawKw;

  if (!raw || typeof raw !== "object") {
    return 0;
  }

  const record = raw as Record<string, unknown>;
  const status = getModuleStatus(module);
  const candidate =
    record[status] ??
    record.idle ??
    record.active ??
    record.online ??
    record.offline ??
    record.damaged;

  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : 0;
}

function getSolarGenerationKw(module: HabitatModule) {
  if (!module.capabilities.includes("solar-generation")) {
    return 0;
  }

  const status = getModuleStatus(module);
  if (status !== "online" && status !== "active") {
    return 0;
  }

  const value = module.runtimeAttributes.powerGenerationKw;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function findBatteryModule(modules: HabitatModule[]) {
  return modules.find((module) => module.capabilities.includes("power-storage")) ?? null;
}

function formatNumber(value: number, digits = 1) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Unknown";
  }

  return `${Math.round(value)}%`;
}

function formatTickTime(currentTick: number) {
  const totalSeconds = currentTick;
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getSolarConditionTone(condition: string | null | undefined) {
  const value = condition?.toLowerCase() ?? "";
  if (value.includes("clear")) {
    return "good";
  }
  if (value.includes("cloud")) {
    return "muted";
  }
  return "warn";
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") {
    root.removeAttribute("data-theme");
    return;
  }
  root.setAttribute("data-theme", mode);
}

export function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [registerName, setRegisterName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [unregistering, setUnregistering] = useState(false);
  const [pendingUnregister, setPendingUnregister] = useState(false);
  const [tickInput, setTickInput] = useState("");
  const [ticking, setTicking] = useState(false);
  const [tickController, setTickController] = useState<AbortController | null>(null);
  const [tickSummary, setTickSummary] = useState<TickSummary | null>(null);
  const [busyModuleId, setBusyModuleId] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(themeMode);
  }, [themeMode]);

  async function refresh(showSpinner = false) {
    if (showSpinner) {
      setRefreshing(true);
    }

    try {
      const next = await loadDashboardData();
      setData(next);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load Habitat state.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const modules = data?.state.modules.modules ?? [];
  const batteryModule = findBatteryModule(modules);

  const powerSummary = (() => {
    const totalConsumptionKw = modules.reduce((sum, module) => sum + getPowerDrawKw(module), 0);
    const totalGenerationKw = modules.reduce((sum, module) => sum + getSolarGenerationKw(module), 0);
    const netPowerKw = totalGenerationKw - totalConsumptionKw;
    const currentEnergy = typeof batteryModule?.runtimeAttributes.currentEnergyKwh === "number"
      ? batteryModule.runtimeAttributes.currentEnergyKwh
      : null;
    const capacity = typeof batteryModule?.runtimeAttributes.energyStorageKwh === "number"
      ? batteryModule.runtimeAttributes.energyStorageKwh
      : null;
    const batteryPct =
      currentEnergy !== null && capacity !== null && capacity > 0 ? (currentEnergy / capacity) * 100 : null;

    return {
      totalConsumptionKw,
      totalGenerationKw,
      netPowerKw,
      batteryPct,
      currentEnergy,
      capacity,
    };
  })();

  const alertMessage = (() => {
    if (powerSummary.batteryPct !== null && powerSummary.batteryPct <= 20) {
      return "Battery reserves are low. Advance carefully and consider reducing module load.";
    }

    if (data?.status.registration === null) {
      return "This Habitat is not registered yet. Register it to hydrate starter state and enable full operations.";
    }

    if (modules.length === 0) {
      return "No modules are loaded yet. Register the Habitat or inspect the backend state.";
    }

    return null;
  })();

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setRegistering(true);
    try {
      await registerHabitat(registerName.trim());
      await refresh(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to register Habitat.");
    } finally {
      setRegistering(false);
    }
  }

  async function handleUnregister() {
    setUnregistering(true);
    try {
      await unregisterHabitat();
      setPendingUnregister(false);
      await refresh(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to unregister Habitat.");
    } finally {
      setUnregistering(false);
    }
  }

  async function handleModuleStatus(moduleId: string, status: "online" | "offline") {
    setBusyModuleId(moduleId);
    try {
      await setModuleStatus(moduleId, status);
      await refresh(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update module status.");
    } finally {
      setBusyModuleId(null);
    }
  }

  async function handleTick(ticks: number) {
    const controller = new AbortController();
    setTicking(true);
    setTickController(controller);
    try {
      const response = await advanceTicks(ticks, controller.signal);
      setTickSummary(response.summary);
      await refresh(true);
    } catch (nextError) {
      if (!(nextError instanceof DOMException && nextError.name === "AbortError")) {
        setError(nextError instanceof Error ? nextError.message : "Unable to advance ticks.");
      }
    } finally {
      setTicking(false);
      setTickController(null);
    }
  }

  if (loading) {
    return <div className="screen-state">Loading Habitat command console…</div>;
  }

  if (!data) {
    return (
      <div className="screen-state">
        <div>
          <h1>Habitat command console</h1>
          <p>{error ?? "No dashboard data is available."}</p>
          <button className="ghost-button" onClick={() => void refresh(true)}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Kepler world / field database</p>
          <nav className="nav-stack" aria-label="Dashboard sections">
            <div className="nav-item nav-item-active" aria-current="page">Overview</div>
          </nav>
        </div>

        <div className="sidebar-footer">
          <p className="sidebar-metric">{data.status.currentTick.toLocaleString()} ticks since start</p>
          <p>Last synchronized {formatTickTime(data.status.currentTick)}</p>
        </div>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <div className="search-card">
            <span className="search-icon">⌕</span>
            <div>
              <p className="search-label">Habitat command console</p>
              <h1>Habitat Overview</h1>
            </div>
          </div>

          <div className="status-strip">
            <div className={`pill pill-${getSolarConditionTone(data.solar.solarIrradiance?.condition)}`}>
              {data.solar.solarIrradiance?.condition ?? "Solar unknown"}
              <span>{data.solar.solarIrradiance ? `${data.solar.solarIrradiance.wPerM2} W/m²` : ""}</span>
            </div>
            <div className={`pill ${powerSummary.batteryPct !== null && powerSummary.batteryPct <= 20 ? "pill-alert" : ""}`}>
              Battery
              <span>{formatPercent(powerSummary.batteryPct)}</span>
            </div>
            <div className="pill">
              Clock
              <span>{formatTickTime(data.status.currentTick)}</span>
            </div>
            <label className="theme-select">
              Theme
              <select value={themeMode} onChange={(event) => setThemeMode(event.target.value as ThemeMode)}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          </div>
        </header>

        {alertMessage ? (
          <section className="hero-alert">
            <div>
              <p className="eyebrow danger">Attention</p>
              <h2>{powerSummary.batteryPct !== null && powerSummary.batteryPct <= 20 ? "Battery low" : "Operator notice"}</h2>
              <p>{alertMessage}</p>
            </div>
            <button className="ghost-button" onClick={() => void refresh(true)}>
              {refreshing ? "Refreshing…" : "Refresh state"}
            </button>
          </section>
        ) : null}

        {error ? <section className="error-banner">{error}</section> : null}

        <section className="card-grid card-grid-primary">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Registration</p>
                <h2>{data.status.registration ? "Registered Habitat" : "Registration required"}</h2>
              </div>
            </div>

            {data.status.registration ? (
              <div className="registration-block">
                <div className="stat-row">
                  <span>Name</span>
                  <strong>{data.status.registration.displayName}</strong>
                </div>
                <div className="stat-row">
                  <span>Habitat ID</span>
                  <strong>{data.status.registration.habitatId ?? "Unknown"}</strong>
                </div>
                <div className="stat-row">
                  <span>Registered</span>
                  <strong>{formatTimestamp(data.status.registration.registeredAt)}</strong>
                </div>
                <div className="panel-actions">
                  <button className="danger-button" onClick={() => setPendingUnregister(true)}>Unregister</button>
                </div>
              </div>
            ) : (
              <form className="registration-form" onSubmit={(event) => void handleRegister(event)}>
                <label>
                  Habitat display name
                  <input
                    value={registerName}
                    onChange={(event) => setRegisterName(event.target.value)}
                    placeholder="Enter a display name"
                  />
                </label>
                <button className="primary-button" disabled={registering || registerName.trim().length === 0}>
                  {registering ? "Registering…" : "Register Habitat"}
                </button>
              </form>
            )}
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">System health</p>
                <h2>Power and battery</h2>
              </div>
            </div>

            <div className="metric-grid">
              <div className="metric-card accent-red">
                <span>Battery</span>
                <strong>{formatPercent(powerSummary.batteryPct)}</strong>
                <small>
                  {powerSummary.currentEnergy !== null && powerSummary.capacity !== null
                    ? `${formatNumber(powerSummary.currentEnergy)} / ${formatNumber(powerSummary.capacity)} kWh`
                    : "No battery data"}
                </small>
              </div>
              <div className="metric-card accent-blue">
                <span>Generation</span>
                <strong>{formatNumber(powerSummary.totalGenerationKw)} kW</strong>
                <small>{data.solar.solarIrradiance?.condition ?? "Unknown solar conditions"}</small>
              </div>
              <div className="metric-card accent-cyan">
                <span>Consumption</span>
                <strong>{formatNumber(powerSummary.totalConsumptionKw)} kW</strong>
                <small>{modules.length} module{modules.length === 1 ? "" : "s"}</small>
              </div>
              <div className={`metric-card ${powerSummary.netPowerKw >= 0 ? "accent-green" : "accent-amber"}`}>
                <span>Net power</span>
                <strong>{formatNumber(powerSummary.netPowerKw)} kW</strong>
                <small>{powerSummary.netPowerKw >= 0 ? "Charging margin" : "Battery drawdown"}</small>
              </div>
            </div>
          </article>
        </section>

        <section className="card-grid card-grid-secondary">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Tick controls</p>
                <h2>Advance time</h2>
              </div>
            </div>

            <div className="tick-actions">
              {[1, 60, 600, 3600].map((ticks) => (
                <button
                  key={ticks}
                  className="ghost-button"
                  disabled={ticking}
                  onClick={() => void handleTick(ticks)}
                >
                  {ticks === 1 ? "1 tick" : `${ticks.toLocaleString()} ticks`}
                </button>
              ))}
              {ticking ? (
                <button className="danger-button" onClick={() => tickController?.abort()}>
                  Stop
                </button>
              ) : null}
            </div>

            <form
              className="tick-custom"
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(tickInput);
                if (Number.isInteger(value) && value > 0) {
                  void handleTick(value);
                }
              }}
            >
              <label>
                Custom ticks
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={tickInput}
                  onChange={(event) => setTickInput(event.target.value)}
                />
              </label>
              <button className="primary-button" disabled={ticking || !/^[1-9]\d*$/.test(tickInput)}>
                {ticking ? "Advancing…" : "Advance"}
              </button>
            </form>

            {tickSummary ? (
              <div className="tick-summary">
                <div className="stat-row"><span>Applied</span><strong>{tickSummary.ticksApplied.toLocaleString()} ticks</strong></div>
                <div className="stat-row"><span>Range</span><strong>{tickSummary.startTick.toLocaleString()} → {tickSummary.endTick.toLocaleString()}</strong></div>
                <div className="stat-row"><span>Drain</span><strong>{formatNumber(tickSummary.batteryDrainedKwh, 3)} kWh</strong></div>
                <div className="stat-row"><span>Solar</span><strong>{tickSummary.solarCondition ?? "Unknown"}</strong></div>
                <p className="subtle-copy">{tickSummary.solarChargingReport}</p>
              </div>
            ) : (
              <p className="subtle-copy">Choose a preset or a custom positive whole number of ticks.</p>
            )}
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Activity</p>
                <h2>Recent backend state</h2>
              </div>
            </div>

            <div className="activity-list">
              <div className="activity-item">
                <span>Tick</span>
                <strong>{data.status.currentTick.toLocaleString()}</strong>
              </div>
              <div className="activity-item">
                <span>Modules</span>
                <strong>{data.status.moduleCount}</strong>
              </div>
            </div>
          </article>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Modules</p>
              <h2>Current modules and power load</h2>
            </div>
          </div>

          {modules.length === 0 ? (
            <div className="empty-state">
              <h3>No modules available</h3>
              <p>Register the Habitat or populate the backend state before operating the dashboard.</p>
            </div>
          ) : (
            <div className="module-table">
              <div className="module-table-head">
                <span>Module</span>
                <span>Status</span>
                <span>Power draw</span>
                <span>Solar</span>
                <span>Actions</span>
              </div>
              {modules.map((module) => {
                const status = getModuleStatus(module);
                return (
                  <div className="module-row" key={module.id}>
                    <div>
                      <strong>{module.displayName}</strong>
                      <p>{module.slug}</p>
                    </div>
                    <div>
                      <span className={`status-chip status-${status}`}>{status}</span>
                    </div>
                    <div>{formatNumber(getPowerDrawKw(module))} kW</div>
                    <div>{formatNumber(getSolarGenerationKw(module))} kW</div>
                    <div className="module-actions">
                      <button
                        className="ghost-button"
                        disabled={busyModuleId === module.id || status === "online"}
                        onClick={() => void handleModuleStatus(module.id, "online")}
                      >
                        Online
                      </button>
                      <button
                        className="ghost-button"
                        disabled={busyModuleId === module.id || status === "offline"}
                        onClick={() => void handleModuleStatus(module.id, "offline")}
                      >
                        Offline
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {pendingUnregister ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="unregister-title">
            <h2 id="unregister-title">Unregister this Habitat?</h2>
            <p>This will remove the saved registration through the backend and leave the Habitat ready to register again.</p>
            <div className="panel-actions">
              <button className="ghost-button" onClick={() => setPendingUnregister(false)}>Cancel</button>
              <button className="danger-button" disabled={unregistering} onClick={() => void handleUnregister()}>
                {unregistering ? "Unregistering…" : "Confirm unregister"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
