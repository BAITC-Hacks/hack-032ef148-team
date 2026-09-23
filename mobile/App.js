import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

// The phone cannot reach "localhost" of the laptop: use the laptop's LAN address (see mobile/README.md).
const DEFAULT_API = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.100:4180";

const colors = {
  navy: "#111936", ink: "#17213c", muted: "#6b7590", line: "#dfe5ee", soft: "#f3f6fa",
  indigo: "#5a55e8", teal: "#13a89e", red: "#d94a60", amber: "#d98b22", white: "#fff"
};
const typeLabels = {
  unit_added: "Новое подразделение", unit_removed: "Упразднение", unit_transformed: "Преобразование",
  function_lost: "Потеря функции", function_added: "Новая функция", function_moved: "Перенос функции",
  function_changed: "Изменение функции", function_narrowed: "Сужение функции",
  function_duplicate: "Дублирование", conflict_risk: "Конфликт полномочий"
};
const reviewLabels = { pending: "Не проверено", approved: "Подтверждено", rejected: "Отклонено" };
const severityColors = { high: colors.red, medium: colors.amber, low: "#8da0bb", info: colors.teal };
const filters = [
  { id: "all", label: "Все" }, { id: "function_lost", label: "Потери" }, { id: "function_narrowed", label: "Сужения" },
  { id: "function_moved", label: "Переносы" }, { id: "function_duplicate", label: "Дубли" }, { id: "conflict_risk", label: "Конфликты" },
  { id: "pending", label: "Не проверено" }
];
const accepted = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv", "text/plain"
];

function fileField(asset) {
  if (Platform.OS === "web" && asset.file) return asset.file;
  return { uri: asset.uri, name: asset.name, type: asset.mimeType || "application/octet-stream" };
}

export default function App() {
  const [api, setApi] = useState(DEFAULT_API);
  const [health, setHealth] = useState(null);
  const [tab, setTab] = useState("upload");
  const [demoSets, setDemoSets] = useState([]);
  const [files, setFiles] = useState({ before: null, after: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [record, setRecord] = useState(null);
  const [filter, setFilter] = useState("all");
  const [history, setHistory] = useState([]);
  const [review, setReview] = useState(null);
  const [session, setSession] = useState(null);
  const [auth, setAuth] = useState({ mode: "signin", name: "", email: "", password: "", error: "" });

  const base = api.replace(/\/+$/, "");
  const request = useCallback(async (path, options = {}) => {
    const headers = { ...(options.headers || {}), ...(session ? { Authorization: `Bearer ${session.token}` } : {}) };
    const response = await fetch(`${base}${path}`, { ...options, headers });
    if (response.status === 204) return null;
    const payload = await response.json();
    if (response.status === 401 && session) setSession(null);
    if (!response.ok) throw new Error(payload.error || `Ошибка ${response.status}`);
    return payload;
  }, [base, session]);

  const connect = useCallback(async () => {
    setError("");
    try {
      setHealth(await request("/api/health"));
      setDemoSets((await request("/api/demo")).items);
    } catch {
      setHealth(null);
      setError("Сервер недоступен. Проверьте адрес и что телефон в той же Wi-Fi сети.");
    }
  }, [request]);

  useEffect(() => { connect(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(action) {
    setBusy(true); setError("");
    try {
      setRecord(await action());
      setFilter("all");
      setTab("results");
    } catch (reason) {
      setError(reason.message || "Не удалось выполнить анализ");
    } finally { setBusy(false); }
  }

  const runDemo = (id) => run(() => request(`/api/demo/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));

  function runUpload() {
    if (!files.before || !files.after) return setError("Выберите документы «ДО» и «ПОСЛЕ»");
    const form = new FormData();
    form.append("before", fileField(files.before));
    form.append("after", fileField(files.after));
    form.append("useAi", "false");
    return run(() => request("/api/analyses", { method: "POST", body: form }));
  }

  async function pick(side) {
    const result = await DocumentPicker.getDocumentAsync({ type: accepted, copyToCacheDirectory: true });
    if (!result.canceled) setFiles((current) => ({ ...current, [side]: result.assets[0] }));
  }

  async function loadHistory() {
    try { setHistory((await request("/api/analyses")).items); } catch (reason) { setError(reason.message); }
  }

  async function openAnalysis(id) {
    try { setRecord(await request(`/api/analyses/${id}`)); setTab("results"); } catch (reason) { setError(reason.message); }
  }

  async function submitAuth() {
    const signup = auth.mode === "signup";
    try {
      const payload = await request(`/api/auth/${signup ? "signup" : "signin"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: auth.email, password: auth.password, ...(signup ? { name: auth.name } : {}) })
      });
      setSession(payload);
      setAuth((current) => ({ ...current, password: "", error: "" }));
    } catch (reason) { setAuth((current) => ({ ...current, error: reason.message })); }
  }

  async function logout() {
    try { await request("/api/auth/logout", { method: "POST" }); } catch { /* the token is dropped locally anyway */ }
    setSession(null);
  }

  async function saveReview(status) {
    try {
      const updated = await request(`/api/analyses/${record.id}/findings/${review.finding.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, comment: review.comment })
      });
      setRecord(updated);
      setReview(null);
    } catch (reason) { setError(reason.message); }
  }

  const findings = useMemo(() => (record?.findings || []).filter((finding) => filter === "all" || finding.type === filter || finding.status === filter), [record, filter]);
  const reviewed = record ? record.findings.filter((finding) => finding.status !== "pending").length : 0;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>Б</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>БАТЫС AI</Text>
            <Text style={styles.brandSub}>{health ? `${health.aiConfigured ? "OpenAI" : "Локальный анализ"} · ${health.storage}` : "Нет подключения"}</Text>
          </View>
          {session ? <Pressable onPress={logout}><Text style={styles.brandSub}>{session.user.name} · выйти</Text></Pressable> : null}
          <View style={[styles.dot, { backgroundColor: health ? "#4bd4a0" : colors.red }]} />
        </View>

        {error ? <Pressable onPress={() => setError("")} style={styles.error}><Text style={styles.errorText}>{error}</Text></Pressable> : null}

        {tab === "upload" && (
          <ScrollView contentContainerStyle={styles.page}>
            <View style={styles.hero}>
              <Text style={styles.pill}>КОНТРОЛЬ ИЗМЕНЕНИЙ</Text>
              <Text style={styles.heroTitle}>Сравните структуру и функции без потери контекста</Text>
              <Text style={styles.heroText}>Каждый вывод подтверждён пунктом и цитатой из документа.</Text>
              {demoSets.map((set, index) => (
                <Pressable key={set.id} style={[styles.demoButton, index === 0 && styles.demoPrimary]} onPress={() => runDemo(set.id)} disabled={busy}>
                  <Text style={styles.demoText}>{index === 0 ? "▶ " : ""}{set.name}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Документы для сравнения</Text>
              <Text style={styles.muted}>DOCX, PDF, XLSX, CSV или TXT</Text>
              {["before", "after"].map((side) => (
                <Pressable key={side} style={[styles.drop, files[side] && styles.dropFilled]} onPress={() => pick(side)}>
                  <Text style={styles.dropTitle}>{side === "before" ? "← Документ «ДО»" : "→ Документ «ПОСЛЕ»"}</Text>
                  <Text style={styles.muted} numberOfLines={1}>{files[side]?.name || "Нажмите, чтобы выбрать файл"}</Text>
                </Pressable>
              ))}
              <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} onPress={runUpload} disabled={busy}>
                <Text style={styles.primaryText}>Запустить анализ →</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Сервер</Text>
              <Text style={styles.muted}>Адрес компьютера с запущенным БАТЫС AI в вашей Wi-Fi сети</Text>
              <TextInput style={styles.input} value={api} onChangeText={setApi} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.100:4180" />
              <Pressable style={styles.ghost} onPress={connect}><Text style={styles.ghostText}>Проверить подключение</Text></Pressable>
            </View>
          </ScrollView>
        )}

        {tab === "results" && (!record ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>Результатов пока нет</Text><Text style={styles.muted}>Запустите демо или загрузите документы.</Text></View>
        ) : (
          <FlatList
            data={findings}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.page}
            ListHeaderComponent={
              <View>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{record.name}</Text>
                  <Text style={styles.muted}>Функций: {record.metrics?.functionsBefore} → {record.metrics?.functionsAfter} · проверено {reviewed} из {record.findings.length}</Text>
                  <View style={styles.metrics}>
                    <Metric label="Потери" value={record.summary.lostFunctions} color={colors.red} />
                    <Metric label="Сужения" value={record.summary.narrowedFunctions} color={colors.amber} />
                    <Metric label="Переносы" value={record.summary.movedFunctions} color={colors.amber} />
                    <Metric label="Дубли" value={record.summary.duplicates} color={colors.amber} />
                    <Metric label="Конфликты" value={record.summary.conflicts} color={colors.red} />
                    <Metric label="Подразд." value={record.summary.unitsAfter} color={colors.ink} />
                  </View>
                  <Pressable style={styles.ghost} onPress={() => Linking.openURL(`${base}/api/analyses/${record.id}/report`)}><Text style={styles.ghostText}>Открыть заключение ↗</Text></Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  {filters.map((item) => (
                    <Pressable key={item.id} onPress={() => setFilter(item.id)} style={[styles.chip, filter === item.id && styles.chipActive]}>
                      <Text style={[styles.chipText, filter === item.id && { color: colors.white }]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            }
            ListEmptyComponent={<Text style={styles.muted}>Нет выводов по фильтру</Text>}
            renderItem={({ item }) => <Finding finding={item} onReview={(finding) => setReview({ finding, comment: finding.comment || "" })} />}
          />
        ))}

        {tab === "history" && (
          <FlatList
            data={history}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.page}
            onRefresh={loadHistory}
            refreshing={false}
            ListHeaderComponent={<Text style={styles.sectionTitle}>История анализов</Text>}
            ListEmptyComponent={<Text style={styles.muted}>История пуста — потяните вниз, чтобы обновить.</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.card} onPress={() => openAnalysis(item.id)}>
                <Text style={styles.findingTitle}>{item.name}</Text>
                <Text style={styles.muted}>{new Date(item.createdAt).toLocaleString("ru-RU")} · {item.summary.total} выводов · {item.summary.lostFunctions} потерь</Text>
              </Pressable>
            )}
          />
        )}

        <SafeAreaView edges={["bottom"]} style={styles.tabbar}>
          {[["upload", "＋", "Анализ"], ["results", "⌁", "Результаты"], ["history", "◷", "История"]].map(([id, icon, label]) => (
            <Pressable key={id} style={styles.tabItem} onPress={() => { setTab(id); if (id === "history") loadHistory(); }}>
              <Text style={[styles.tabIcon, tab === id && { color: colors.indigo }]}>{icon}</Text>
              <Text style={[styles.tabLabel, tab === id && { color: colors.indigo }]}>{label}</Text>
            </Pressable>
          ))}
        </SafeAreaView>

        <Modal visible={busy} transparent animationType="fade">
          <View style={styles.overlay}><View style={styles.processing}><ActivityIndicator size="large" color={colors.indigo} /><Text style={styles.cardTitle}>Анализируем документы</Text><Text style={styles.muted}>Сопоставляем подразделения и функции…</Text></View></View>
        </Modal>

        <Modal visible={Boolean(review)} transparent animationType="slide" onRequestClose={() => setReview(null)}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <Text style={styles.pillDark}>ЭКСПЕРТНАЯ ПРОВЕРКА</Text>
              <Text style={styles.cardTitle}>{review?.finding.title}</Text>
              {!session ? (
                <View>
                  <Text style={styles.muted}>Подтверждать выводы может только эксперт. Войдите или зарегистрируйтесь.</Text>
                  <View style={[styles.row, { marginTop: 10 }]}>
                    {[["signin", "Вход"], ["signup", "Регистрация"]].map(([mode, label]) => (
                      <Pressable key={mode} onPress={() => setAuth((current) => ({ ...current, mode, error: "" }))} style={[styles.chip, { flex: 1, alignItems: "center", marginRight: 0 }, auth.mode === mode && styles.chipActive]}>
                        <Text style={[styles.chipText, auth.mode === mode && { color: colors.white }]}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {auth.mode === "signup" ? <TextInput style={styles.input} placeholder="Имя" value={auth.name} onChangeText={(name) => setAuth((current) => ({ ...current, name }))} /> : null}
                  <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={auth.email} onChangeText={(email) => setAuth((current) => ({ ...current, email }))} />
                  <TextInput style={styles.input} placeholder="Пароль (минимум 8 символов)" secureTextEntry value={auth.password} onChangeText={(password) => setAuth((current) => ({ ...current, password }))} />
                  {auth.error ? <Text style={[styles.errorText, { marginTop: 8 }]}>{auth.error}</Text> : null}
                  <View style={[styles.row, { marginTop: 12 }]}>
                    <Pressable style={[styles.ghost, { flex: 1, marginTop: 0 }]} onPress={() => setReview(null)}><Text style={styles.ghostText}>Отмена</Text></Pressable>
                    <Pressable style={[styles.primary, { flex: 1, marginTop: 0 }]} onPress={submitAuth}><Text style={styles.primaryText}>{auth.mode === "signup" ? "Создать аккаунт" : "Войти"}</Text></Pressable>
                  </View>
                </View>
              ) : (
              <View>
              <Text style={styles.muted}>Эксперт: {session.user.name}</Text>
              <TextInput style={[styles.input, { height: 110, textAlignVertical: "top" }]} multiline placeholder="Почему вывод подтверждён или отклонён?" value={review?.comment} onChangeText={(comment) => setReview((current) => ({ ...current, comment }))} />
              <View style={styles.row}>
                <Pressable style={[styles.ghost, { flex: 1 }]} onPress={() => setReview(null)}><Text style={styles.ghostText}>Отмена</Text></Pressable>
                <Pressable style={[styles.danger, { flex: 1 }]} onPress={() => saveReview("rejected")}><Text style={styles.dangerText}>Отклонить</Text></Pressable>
                <Pressable style={[styles.primary, { flex: 1, marginTop: 0 }]} onPress={() => saveReview("approved")}><Text style={styles.primaryText}>Подтвердить</Text></Pressable>
              </View>
              </View>
              )}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Metric({ label, value, color }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, { color }]}>{Number(value || 0)}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Finding({ finding, onReview }) {
  return (
    <View style={[styles.card, styles.finding, { borderLeftColor: severityColors[finding.severity] }]}>
      <View style={styles.row}>
        <Text style={styles.pillDark}>{(typeLabels[finding.type] || finding.type).toUpperCase()}</Text>
        <Text style={[styles.status, finding.status === "approved" && styles.approved, finding.status === "rejected" && styles.rejected]}>{reviewLabels[finding.status]}</Text>
      </View>
      <Text style={styles.findingTitle}>{finding.title}</Text>
      <Text style={styles.body}>{finding.explanation}</Text>
      {finding.evidence.map((item, index) => (
        <View key={index} style={[styles.evidence, item.side === "after" && { borderLeftColor: colors.teal }]}>
          <Text style={styles.evidenceHead}>{item.side === "before" ? "ДО" : "ПОСЛЕ"} · п. {item.clause}</Text>
          {item.unit && item.unit !== "Общие функции" ? <Text style={styles.evidenceUnit} numberOfLines={1}>{item.unit}</Text> : null}
          <Text style={styles.evidenceText} numberOfLines={4}>{item.snippet}</Text>
        </View>
      ))}
      <Text style={styles.recommendation}>Рекомендация: {finding.recommendation}</Text>
      {finding.comment ? <Text style={styles.body}>Комментарий эксперта: {finding.comment}</Text> : null}
      {finding.reviewedBy ? <Text style={styles.muted}>Решение: {finding.reviewedBy.name}</Text> : null}
      <Pressable style={styles.ghost} onPress={() => onReview(finding)}><Text style={styles.ghostText}>Проверить вывод · {finding.confidence}%</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: colors.navy },
  brandMark: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.indigo, alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: colors.white, fontWeight: "900", fontSize: 18 },
  brand: { color: colors.white, fontSize: 18, fontWeight: "800" },
  brandSub: { color: "#9ca8ca", fontSize: 11, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  page: { padding: 16, paddingBottom: 32, backgroundColor: colors.soft, flexGrow: 1 },
  hero: { backgroundColor: "#25245f", borderRadius: 22, padding: 22, marginBottom: 14 },
  pill: { color: "#b9b7ff", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  pillDark: { color: "#514cc8", backgroundColor: "#e8e7ff", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontSize: 9, fontWeight: "900", overflow: "hidden" },
  heroTitle: { color: colors.white, fontSize: 24, fontWeight: "800", marginTop: 10, lineHeight: 29 },
  heroText: { color: "#c5cce4", marginTop: 8, lineHeight: 20 },
  demoButton: { marginTop: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderRadius: 12, padding: 13 },
  demoPrimary: { backgroundColor: colors.teal, borderColor: colors.teal },
  demoText: { color: colors.white, fontWeight: "800" },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 17, fontWeight: "800", color: colors.ink, marginVertical: 6 },
  sectionTitle: { fontSize: 20, fontWeight: "800", color: colors.ink, marginBottom: 12 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  drop: { borderWidth: 1.5, borderStyle: "dashed", borderColor: "#c9d1df", borderRadius: 14, padding: 18, marginTop: 12, backgroundColor: "#fafbfd" },
  dropFilled: { borderColor: colors.indigo, backgroundColor: "#f5f4ff" },
  dropTitle: { fontWeight: "800", color: colors.ink, marginBottom: 4 },
  primary: { backgroundColor: colors.indigo, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 14 },
  primaryText: { color: colors.white, fontWeight: "800" },
  ghost: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 11, alignItems: "center", marginTop: 12 },
  ghostText: { color: "#4e5670", fontWeight: "800", fontSize: 13 },
  danger: { backgroundColor: "#fff0f2", borderWidth: 1, borderColor: "#ffd1d8", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  dangerText: { color: "#b72d45", fontWeight: "800" },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 11, padding: 12, marginTop: 10, color: colors.ink, backgroundColor: "#fbfcfe" },
  error: { backgroundColor: "#fff6df", padding: 12, marginHorizontal: 16, marginTop: 10, borderRadius: 11, borderWidth: 1, borderColor: "#f1d38c" },
  errorText: { color: "#8b6419", fontSize: 12 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  metric: { width: "31%", backgroundColor: colors.soft, borderRadius: 12, padding: 10 },
  metricValue: { fontSize: 22, fontWeight: "900" },
  metricLabel: { color: colors.muted, fontSize: 10, textTransform: "uppercase" },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginRight: 7 },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontSize: 12, fontWeight: "800", color: "#657087" },
  finding: { borderLeftWidth: 5 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  status: { fontSize: 10, fontWeight: "900", color: "#687287", backgroundColor: "#f0f2f6", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  approved: { color: "#148664", backgroundColor: "#dcf6ec" },
  rejected: { color: "#b72d45", backgroundColor: "#ffe2e6" },
  findingTitle: { fontSize: 15, fontWeight: "800", color: colors.ink, marginTop: 8 },
  body: { color: "#59647b", fontSize: 13, lineHeight: 19, marginTop: 6 },
  evidence: { backgroundColor: "#f6f8fb", borderRadius: 10, padding: 10, marginTop: 8, borderLeftWidth: 3, borderLeftColor: "#7470e9" },
  evidenceHead: { fontSize: 11, fontWeight: "800", color: "#4e5670" },
  evidenceUnit: { fontSize: 11, color: "#7470e9", marginTop: 2 },
  evidenceText: { fontSize: 12, color: "#6b7489", marginTop: 4, lineHeight: 17 },
  recommendation: { backgroundColor: "#f7f6ff", color: "#504b9f", borderRadius: 10, padding: 10, marginTop: 10, fontSize: 12, overflow: "hidden" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.soft, padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.ink, marginBottom: 6 },
  tabbar: { flexDirection: "row", backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 8 },
  tabIcon: { fontSize: 18, color: "#8a93a7" },
  tabLabel: { fontSize: 10, fontWeight: "800", color: "#8a93a7" },
  overlay: { flex: 1, backgroundColor: "rgba(10,16,38,0.7)", justifyContent: "center", padding: 20 },
  processing: { backgroundColor: colors.white, borderRadius: 22, padding: 28, alignItems: "center", gap: 6 },
  sheet: { backgroundColor: colors.white, borderRadius: 22, padding: 20 }
});
