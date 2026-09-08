import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * ShipzyCart International Billing Dashboard - Java server.
 * Pure JDK (com.sun.net.httpserver) + sqlite-jdbc + org.json. No framework, no Maven.
 * Same API surface as the Node version; frontends in /public are shared.
 */
public class App {
    static final String DATA_DIR = env("DATA_DIR", new File("data").getAbsolutePath());
    static final File UPLOAD_DIR = new File(DATA_DIR, "uploads");
    static final String ADMIN_USER = env("ADMIN_USER", "admin");
    static final String ADMIN_PASS = env("ADMIN_PASS", "shipzy@2026");
    static final long MAX_DOC_BYTES = 15L * 1024 * 1024;
    static Connection db;
    static final SecureRandom RNG = new SecureRandom();

    static String env(String k, String d) {
        String v = System.getenv(k);
        return (v == null || v.isEmpty()) ? d : v;
    }

    public static void main(String[] args) throws Exception {
        UPLOAD_DIR.mkdirs();
        Class.forName("org.sqlite.JDBC");
        db = DriverManager.getConnection("jdbc:sqlite:" + new File(DATA_DIR, "billing.db").getAbsolutePath());
        try (Statement st = db.createStatement()) {
            st.execute("PRAGMA journal_mode=WAL");
            st.execute("PRAGMA busy_timeout=5000");
        }
        initSchema();
        int port = Integer.parseInt(env("PORT", "3000"));
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/", App::route);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();
        System.out.println("ShipzyCart Intl Billing (Java) on :" + port + " | data dir: " + DATA_DIR);
    }

    // ---------- schema ----------
    static void initSchema() throws Exception {
        String[] ddl = {
            "CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, email TEXT, phone TEXT, gstin TEXT, address TEXT, password_hash TEXT NOT NULL, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS consignees (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, company TEXT NOT NULL, contact TEXT, address TEXT, country TEXT, phone TEXT, email TEXT, created_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS providers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)",
            "CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL, name TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS shipments (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, from_address TEXT, from_country TEXT DEFAULT 'India', from_pincode TEXT, consignee_id INTEGER, to_company TEXT, to_contact TEXT, to_address TEXT, to_country TEXT, to_phone TEXT, provider TEXT, service TEXT, awb TEXT, ship_date TEXT, incoterm TEXT, export_type TEXT, invoice_no TEXT, invoice_date TEXT, invoice_value REAL, currency TEXT DEFAULT 'USD', items_desc TEXT, actual_weight REAL DEFAULT 0, volumetric_weight REAL DEFAULT 0, chargeable_weight REAL DEFAULT 0, box_count INTEGER DEFAULT 0, rate REAL DEFAULT 0, amount REAL DEFAULT 0, status TEXT DEFAULT 'Booked', notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS boxes (id INTEGER PRIMARY KEY AUTOINCREMENT, shipment_id INTEGER NOT NULL, count INTEGER DEFAULT 1, length REAL, width REAL, height REAL, weight REAL, divisor INTEGER DEFAULT 5000)",
            "CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY AUTOINCREMENT, shipment_id INTEGER NOT NULL, stored_name TEXT NOT NULL, original_name TEXT NOT NULL, size INTEGER, uploaded_at TEXT DEFAULT (datetime('now')))"
        };
        synchronized (db) {
            try (Statement st = db.createStatement()) {
                for (String s : ddl) st.execute(s);
            }
        }
        JSONArray c = q("SELECT COUNT(*) c FROM providers");
        if (c.getJSONObject(0).getLong("c") == 0) {
            for (String p : new String[]{"FedEx", "DHL", "UPS", "Aramex", "Self - Dedicate Master"})
                exec("INSERT INTO providers (name) VALUES (?)", p);
        }
    }

    // ---------- db helpers ----------
    static void bind(PreparedStatement ps, Object... params) throws Exception {
        for (int i = 0; i < params.length; i++) ps.setObject(i + 1, params[i]);
    }

    static JSONArray q(String sql, Object... params) throws Exception {
        synchronized (db) {
            try (PreparedStatement ps = db.prepareStatement(sql)) {
                bind(ps, params);
                try (ResultSet rs = ps.executeQuery()) {
                    JSONArray arr = new JSONArray();
                    ResultSetMetaData md = rs.getMetaData();
                    while (rs.next()) {
                        JSONObject o = new JSONObject();
                        for (int i = 1; i <= md.getColumnCount(); i++) {
                            Object v = rs.getObject(i);
                            o.put(md.getColumnLabel(i), v == null ? JSONObject.NULL : v);
                        }
                        arr.put(o);
                    }
                    return arr;
                }
            }
        }
    }

    static JSONObject q1(String sql, Object... params) throws Exception {
        JSONArray a = q(sql, params);
        return a.length() > 0 ? a.getJSONObject(0) : null;
    }

    static long exec(String sql, Object... params) throws Exception {
        synchronized (db) {
            try (PreparedStatement ps = db.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                bind(ps, params);
                ps.executeUpdate();
                try (ResultSet ks = ps.getGeneratedKeys()) {
                    if (ks.next()) return ks.getLong(1);
                }
                return 0;
            }
        }
    }

    // ---------- http helpers ----------
    static void send(HttpExchange ex, int status, String json) throws Exception {
        byte[] b = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(status, b.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(b); }
    }

    static void ok(HttpExchange ex) throws Exception { send(ex, 200, "{\"ok\":true}"); }
    static void err(HttpExchange ex, int status, String msg) throws Exception {
        send(ex, status, new JSONObject().put("error", msg).toString());
    }

    static String readBody(HttpExchange ex) throws Exception {
        try (InputStream is = ex.getRequestBody()) {
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    static JSONObject jsonBody(HttpExchange ex) throws Exception {
        String s = readBody(ex);
        return s.isBlank() ? new JSONObject() : new JSONObject(s);
    }

    static Map<String, String> cookies(HttpExchange ex) {
        Map<String, String> m = new HashMap<>();
        String h = ex.getRequestHeaders().getFirst("Cookie");
        if (h != null) for (String part : h.split(";")) {
            int i = part.indexOf('=');
            if (i > 0) m.put(part.substring(0, i).trim(), part.substring(i + 1).trim());
        }
        return m;
    }

    static void setCookie(HttpExchange ex, String name, String value, long maxAge) {
        ex.getResponseHeaders().add("Set-Cookie", name + "=" + value + "; HttpOnly; Path=/; SameSite=Lax; Max-Age=" + maxAge);
    }

    // Separate cookies per portal so admin and customer sessions in the same browser don't clobber each other
    static JSONObject authAdmin(HttpExchange ex) {
        JSONObject p = Auth.verify(cookies(ex).get("atok"));
        return isAdmin(p) ? p : null;
    }
    static JSONObject authCust(HttpExchange ex) {
        JSONObject p = Auth.verify(cookies(ex).get("ctok"));
        return isCustomer(p) ? p : null;
    }

    static boolean isAdmin(JSONObject p) { return p != null && "admin".equals(p.optString("role")); }
    static boolean isCustomer(JSONObject p) { return p != null && "customer".equals(p.optString("role")); }

    // field coercion (frontend sends strings for numbers, "" for empty)
    static String str(JSONObject b, String k) {
        Object v = b.opt(k);
        if (v == null || v == JSONObject.NULL) return "";
        return String.valueOf(v);
    }
    static String str(JSONObject b, String k, String d) {
        String s = str(b, k);
        return s.isEmpty() ? d : s;
    }
    static double num(JSONObject b, String k) {
        String s = str(b, k);
        if (s.isEmpty()) return 0;
        try { return Double.parseDouble(s); } catch (Exception e) { return 0; }
    }
    static Long lng(JSONObject b, String k) {
        String s = str(b, k);
        if (s.isEmpty() || "null".equals(s)) return null;
        try { return (long) Double.parseDouble(s); } catch (Exception e) { return null; }
    }
    static double round2(double d) { return Math.round(d * 100.0) / 100.0; }

    // ---------- routing ----------
    static final Pattern P_CUST_ID = Pattern.compile("^/api/customers/(\\d+)$");
    static final Pattern P_CONS_ID = Pattern.compile("^/api/consignees/(\\d+)$");
    static final Pattern P_PROV_ID = Pattern.compile("^/api/settings/providers/(\\d+)$");
    static final Pattern P_SVC_ID = Pattern.compile("^/api/settings/services/(\\d+)$");
    static final Pattern P_SHIP_ID = Pattern.compile("^/api/shipments/(\\d+)$");
    static final Pattern P_SHIP_DOCS = Pattern.compile("^/api/shipments/(\\d+)/documents$");
    static final Pattern P_DOC_ID = Pattern.compile("^/api/documents/(\\d+)$");
    static final Pattern P_DOC_DL = Pattern.compile("^/api/documents/(\\d+)/download$");
    static final Pattern P_MY_SHIP_ID = Pattern.compile("^/api/my/shipments/(\\d+)$");

    static void route(HttpExchange ex) {
        try {
            String p = ex.getRequestURI().getPath();
            String m = ex.getRequestMethod();
            Matcher mt;

            if (p.equals("/api/login") && m.equals("POST")) { login(ex); return; }
            if (p.equals("/api/logout") && m.equals("POST")) { setCookie(ex, "atok", "", 0); setCookie(ex, "ctok", "", 0); ok(ex); return; }
            if (p.equals("/api/me") && m.equals("GET")) { me(ex); return; }

            // customer portal
            if (p.equals("/api/my/shipments") && m.equals("GET")) { myShipments(ex); return; }
            if ((mt = P_MY_SHIP_ID.matcher(p)).matches() && m.equals("GET")) { myShipmentDetail(ex, Long.parseLong(mt.group(1))); return; }
            if ((mt = P_DOC_DL.matcher(p)).matches() && m.equals("GET")) { docDownload(ex, Long.parseLong(mt.group(1))); return; }

            // admin API
            if (p.startsWith("/api/")) {
                JSONObject a = authAdmin(ex);
                if (a == null) { err(ex, 401, "unauthorized"); return; }

                if (p.equals("/api/customers") && m.equals("GET")) { send(ex, 200, q("SELECT id, code, name, email, phone, gstin, address, active, created_at FROM customers ORDER BY name").toString()); return; }
                if (p.equals("/api/customers") && m.equals("POST")) { custCreate(ex); return; }
                if ((mt = P_CUST_ID.matcher(p)).matches() && m.equals("PUT")) { custUpdate(ex, Long.parseLong(mt.group(1))); return; }

                if (p.equals("/api/consignees") && m.equals("GET")) { send(ex, 200, q("SELECT cs.*, c.name AS customer_name FROM consignees cs LEFT JOIN customers c ON c.id = cs.customer_id ORDER BY cs.company").toString()); return; }
                if (p.equals("/api/consignees") && m.equals("POST")) { consSave(ex, null); return; }
                if ((mt = P_CONS_ID.matcher(p)).matches() && m.equals("PUT")) { consSave(ex, Long.parseLong(mt.group(1))); return; }
                if ((mt = P_CONS_ID.matcher(p)).matches() && m.equals("DELETE")) { exec("DELETE FROM consignees WHERE id=?", Long.parseLong(mt.group(1))); ok(ex); return; }

                if (p.equals("/api/settings/services") && m.equals("GET")) {
                    JSONObject r = new JSONObject();
                    r.put("providers", q("SELECT * FROM providers ORDER BY name"));
                    r.put("services", q("SELECT * FROM services ORDER BY name"));
                    send(ex, 200, r.toString()); return;
                }
                if (p.equals("/api/settings/providers") && m.equals("POST")) {
                    JSONObject b = jsonBody(ex);
                    try { long id = exec("INSERT INTO providers (name) VALUES (?)", str(b, "name")); send(ex, 200, new JSONObject().put("ok", true).put("id", id).toString()); }
                    catch (Exception e) { err(ex, 400, "exists"); }
                    return;
                }
                if ((mt = P_PROV_ID.matcher(p)).matches() && m.equals("DELETE")) {
                    long id = Long.parseLong(mt.group(1));
                    exec("DELETE FROM services WHERE provider_id=?", id);
                    exec("DELETE FROM providers WHERE id=?", id);
                    ok(ex); return;
                }
                if (p.equals("/api/settings/services") && m.equals("POST")) {
                    JSONObject b = jsonBody(ex);
                    long id = exec("INSERT INTO services (provider_id, name) VALUES (?,?)", lng(b, "provider_id"), str(b, "name"));
                    send(ex, 200, new JSONObject().put("ok", true).put("id", id).toString()); return;
                }
                if ((mt = P_SVC_ID.matcher(p)).matches() && m.equals("DELETE")) { exec("DELETE FROM services WHERE id=?", Long.parseLong(mt.group(1))); ok(ex); return; }

                if (p.equals("/api/shipments") && m.equals("GET")) { send(ex, 200, q("SELECT s.*, c.name AS customer_name, c.code AS customer_code FROM shipments s JOIN customers c ON c.id = s.customer_id ORDER BY s.ship_date DESC, s.id DESC").toString()); return; }
                if (p.equals("/api/shipments") && m.equals("POST")) { shipSave(ex, null); return; }
                if ((mt = P_SHIP_ID.matcher(p)).matches() && m.equals("GET")) { shipDetail(ex, Long.parseLong(mt.group(1))); return; }
                if ((mt = P_SHIP_ID.matcher(p)).matches() && m.equals("PUT")) { shipSave(ex, Long.parseLong(mt.group(1))); return; }
                if ((mt = P_SHIP_ID.matcher(p)).matches() && m.equals("DELETE")) { shipDelete(ex, Long.parseLong(mt.group(1))); return; }

                if ((mt = P_SHIP_DOCS.matcher(p)).matches() && m.equals("POST")) { docUpload(ex, Long.parseLong(mt.group(1))); return; }
                if ((mt = P_DOC_ID.matcher(p)).matches() && m.equals("DELETE")) { docDelete(ex, Long.parseLong(mt.group(1))); return; }

                err(ex, 404, "not found"); return;
            }

            serveStatic(ex, p);
        } catch (Exception e) {
            try { err(ex, 500, "server error: " + e.getMessage()); } catch (Exception ignored) {}
        }
    }

    // ---------- auth ----------
    static void login(HttpExchange ex) throws Exception {
        JSONObject b = jsonBody(ex);
        String role = str(b, "role");
        if ("admin".equals(role)) {
            if (ADMIN_USER.equals(str(b, "username")) && ADMIN_PASS.equals(str(b, "password"))) {
                setCookie(ex, "atok", Auth.sign(new JSONObject().put("role", "admin").put("exp", System.currentTimeMillis() + 12 * 3600_000L)), 43200);
                send(ex, 200, "{\"ok\":true,\"role\":\"admin\"}");
            } else err(ex, 401, "Invalid credentials");
            return;
        }
        String code = str(b, "code").trim().toUpperCase();
        JSONObject cust = q1("SELECT * FROM customers WHERE code = ? AND active = 1", code);
        if (cust != null && Auth.checkPassword(str(b, "password"), cust.getString("password_hash"))) {
            setCookie(ex, "ctok", Auth.sign(new JSONObject().put("role", "customer").put("cid", cust.getLong("id")).put("exp", System.currentTimeMillis() + 12 * 3600_000L)), 43200);
            send(ex, 200, new JSONObject().put("ok", true).put("role", "customer").put("name", cust.getString("name")).put("code", cust.getString("code")).toString());
        } else err(ex, 401, "Invalid customer code or password");
    }

    static void me(HttpExchange ex) throws Exception {
        String qs = ex.getRequestURI().getQuery();
        String portal = qs != null && qs.contains("p=admin") ? "admin" : (qs != null && qs.contains("p=customer") ? "customer" : "");
        JSONObject p = "admin".equals(portal) ? authAdmin(ex)
                     : "customer".equals(portal) ? authCust(ex)
                     : (authAdmin(ex) != null ? authAdmin(ex) : authCust(ex));
        if (p == null) { send(ex, 200, new JSONObject().put("role", JSONObject.NULL).toString()); return; }
        if (isCustomer(p)) {
            JSONObject c = q1("SELECT name, code FROM customers WHERE id = ?", p.getLong("cid"));
            send(ex, 200, new JSONObject().put("role", "customer")
                .put("name", c != null ? c.getString("name") : "")
                .put("code", c != null ? c.getString("code") : "").toString());
            return;
        }
        send(ex, 200, new JSONObject().put("role", p.getString("role")).toString());
    }

    // ---------- customers ----------
    static void custCreate(HttpExchange ex) throws Exception {
        JSONObject b = jsonBody(ex);
        String code = str(b, "code").trim().toUpperCase(), name = str(b, "name"), pw = str(b, "password");
        if (code.isEmpty() || name.isEmpty() || pw.isEmpty()) { err(ex, 400, "code, name, password required"); return; }
        try {
            long id = exec("INSERT INTO customers (code, name, email, phone, gstin, address, password_hash) VALUES (?,?,?,?,?,?,?)",
                code, name, str(b, "email"), str(b, "phone"), str(b, "gstin"), str(b, "address"), Auth.hashPassword(pw));
            send(ex, 200, new JSONObject().put("ok", true).put("id", id).toString());
        } catch (Exception e) { err(ex, 400, "Customer code already exists"); }
    }

    static void custUpdate(HttpExchange ex, long id) throws Exception {
        JSONObject b = jsonBody(ex);
        exec("UPDATE customers SET name=?, email=?, phone=?, gstin=?, address=?, active=? WHERE id=?",
            str(b, "name"), str(b, "email"), str(b, "phone"), str(b, "gstin"), str(b, "address"),
            b.optBoolean("active", true) ? 1 : 0, id);
        String pw = str(b, "password");
        if (!pw.isEmpty()) exec("UPDATE customers SET password_hash=? WHERE id=?", Auth.hashPassword(pw), id);
        ok(ex);
    }

    // ---------- consignees ----------
    static void consSave(HttpExchange ex, Long id) throws Exception {
        JSONObject b = jsonBody(ex);
        String company = str(b, "company");
        if (company.isEmpty()) { err(ex, 400, "company required"); return; }
        if (id == null) {
            long nid = exec("INSERT INTO consignees (customer_id, company, contact, address, country, phone, email) VALUES (?,?,?,?,?,?,?)",
                lng(b, "customer_id"), company, str(b, "contact"), str(b, "address"), str(b, "country"), str(b, "phone"), str(b, "email"));
            send(ex, 200, new JSONObject().put("ok", true).put("id", nid).toString());
        } else {
            exec("UPDATE consignees SET customer_id=?, company=?, contact=?, address=?, country=?, phone=?, email=? WHERE id=?",
                lng(b, "customer_id"), company, str(b, "contact"), str(b, "address"), str(b, "country"), str(b, "phone"), str(b, "email"), id);
            ok(ex);
        }
    }

    // ---------- shipments ----------
    static double[] computeWeights(JSONArray boxes) {
        double actual = 0, vol = 0;
        long count = 0;
        if (boxes != null) for (int i = 0; i < boxes.length(); i++) {
            JSONObject b = boxes.getJSONObject(i);
            double n = num(b, "count");
            if (n <= 0) n = 1;
            count += (long) n;
            actual += n * num(b, "weight");
            double d = num(b, "divisor");
            if (d <= 0) d = 5000;
            vol += n * (num(b, "length") * num(b, "width") * num(b, "height")) / d;
        }
        return new double[]{round2(actual), round2(vol), round2(Math.max(actual, vol)), count};
    }

    static void shipSave(HttpExchange ex, Long id) throws Exception {
        JSONObject b = jsonBody(ex);
        Long custId = lng(b, "customer_id");
        if (custId == null) { err(ex, 400, "customer required"); return; }
        JSONArray boxes = b.optJSONArray("boxes");
        double[] w = computeWeights(boxes);
        double rate = num(b, "rate");
        double amount = str(b, "amount").isEmpty() ? round2(w[2] * rate) : num(b, "amount");
        Object[] vals = {
            custId, str(b, "from_address"), str(b, "from_country", "India"), str(b, "from_pincode"), lng(b, "consignee_id"),
            str(b, "to_company"), str(b, "to_contact"), str(b, "to_address"), str(b, "to_country"), str(b, "to_phone"),
            str(b, "provider"), str(b, "service"), str(b, "awb"), str(b, "ship_date"), str(b, "incoterm"), str(b, "export_type"),
            str(b, "invoice_no"), str(b, "invoice_date"), num(b, "invoice_value"), str(b, "currency", "USD"), str(b, "items_desc"),
            w[0], w[1], w[2], (long) w[3], rate, amount, str(b, "status", "Booked"), str(b, "notes")
        };
        long sid;
        if (id == null) {
            sid = exec("INSERT INTO shipments (customer_id, from_address, from_country, from_pincode, consignee_id, to_company, to_contact, to_address, to_country, to_phone, provider, service, awb, ship_date, incoterm, export_type, invoice_no, invoice_date, invoice_value, currency, items_desc, actual_weight, volumetric_weight, chargeable_weight, box_count, rate, amount, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", vals);
        } else {
            Object[] upd = new Object[vals.length + 1];
            System.arraycopy(vals, 0, upd, 0, vals.length);
            upd[vals.length] = id;
            exec("UPDATE shipments SET customer_id=?, from_address=?, from_country=?, from_pincode=?, consignee_id=?, to_company=?, to_contact=?, to_address=?, to_country=?, to_phone=?, provider=?, service=?, awb=?, ship_date=?, incoterm=?, export_type=?, invoice_no=?, invoice_date=?, invoice_value=?, currency=?, items_desc=?, actual_weight=?, volumetric_weight=?, chargeable_weight=?, box_count=?, rate=?, amount=?, status=?, notes=? WHERE id=?", upd);
            exec("DELETE FROM boxes WHERE shipment_id=?", id);
            sid = id;
        }
        if (boxes != null) for (int i = 0; i < boxes.length(); i++) {
            JSONObject x = boxes.getJSONObject(i);
            double n = num(x, "count");
            if (n <= 0) n = 1;
            double d = num(x, "divisor");
            if (d <= 0) d = 5000;
            exec("INSERT INTO boxes (shipment_id, count, length, width, height, weight, divisor) VALUES (?,?,?,?,?,?,?)",
                sid, (long) n, num(x, "length"), num(x, "width"), num(x, "height"), num(x, "weight"), (long) d);
        }
        send(ex, 200, new JSONObject().put("ok", true).put("id", sid).toString());
    }

    static void shipDetail(HttpExchange ex, long id) throws Exception {
        JSONObject s = q1("SELECT s.*, c.name AS customer_name, c.code AS customer_code FROM shipments s JOIN customers c ON c.id=s.customer_id WHERE s.id=?", id);
        if (s == null) { err(ex, 404, "not found"); return; }
        s.put("boxes", q("SELECT * FROM boxes WHERE shipment_id=?", id));
        s.put("documents", q("SELECT id, original_name, size, uploaded_at FROM documents WHERE shipment_id=?", id));
        send(ex, 200, s.toString());
    }

    static void shipDelete(HttpExchange ex, long id) throws Exception {
        JSONArray docs = q("SELECT stored_name FROM documents WHERE shipment_id=?", id);
        for (int i = 0; i < docs.length(); i++)
            new File(UPLOAD_DIR, docs.getJSONObject(i).getString("stored_name")).delete();
        exec("DELETE FROM documents WHERE shipment_id=?", id);
        exec("DELETE FROM boxes WHERE shipment_id=?", id);
        exec("DELETE FROM shipments WHERE id=?", id);
        ok(ex);
    }

    // ---------- documents (JSON base64 upload) ----------
    static void docUpload(HttpExchange ex, long shipmentId) throws Exception {
        JSONObject b = jsonBody(ex);
        JSONArray files = b.optJSONArray("files");
        if (files == null || files.length() == 0) { err(ex, 400, "no files"); return; }
        if (files.length() > 10) { err(ex, 400, "max 10 files per upload"); return; }
        int saved = 0;
        for (int i = 0; i < files.length(); i++) {
            JSONObject f = files.getJSONObject(i);
            String name = str(f, "name", "file");
            byte[] data;
            try { data = Base64.getMimeDecoder().decode(str(f, "data")); }
            catch (Exception e) { err(ex, 400, "bad base64 for " + name); return; }
            if (data.length > MAX_DOC_BYTES) { err(ex, 400, name + " exceeds 15 MB"); return; }
            String ext = "";
            int dot = name.lastIndexOf('.');
            if (dot >= 0) ext = name.substring(dot);
            byte[] rnd = new byte[4];
            RNG.nextBytes(rnd);
            StringBuilder hex = new StringBuilder();
            for (byte x : rnd) hex.append(String.format("%02x", x));
            String stored = System.currentTimeMillis() + "-" + hex + ext;
            Files.write(new File(UPLOAD_DIR, stored).toPath(), data);
            exec("INSERT INTO documents (shipment_id, stored_name, original_name, size) VALUES (?,?,?,?)", shipmentId, stored, name, (long) data.length);
            saved++;
        }
        send(ex, 200, new JSONObject().put("ok", true).put("count", saved).toString());
    }

    static void docDelete(HttpExchange ex, long id) throws Exception {
        JSONObject d = q1("SELECT * FROM documents WHERE id=?", id);
        if (d != null) {
            new File(UPLOAD_DIR, d.getString("stored_name")).delete();
            exec("DELETE FROM documents WHERE id=?", id);
        }
        ok(ex);
    }

    static void docDownload(HttpExchange ex, long id) throws Exception {
        JSONObject p = authAdmin(ex);
        if (p == null) p = authCust(ex);
        if (p == null) { err(ex, 401, "unauthorized"); return; }
        JSONObject d = q1("SELECT * FROM documents WHERE id=?", id);
        if (d == null) { err(ex, 404, "not found"); return; }
        if (isCustomer(p)) {
            JSONObject s = q1("SELECT customer_id FROM shipments WHERE id=?", d.getLong("shipment_id"));
            if (s == null || s.getLong("customer_id") != p.getLong("cid")) { err(ex, 403, "forbidden"); return; }
        }
        File f = new File(UPLOAD_DIR, d.getString("stored_name"));
        if (!f.exists()) { err(ex, 404, "file missing"); return; }
        String fname = d.getString("original_name").replaceAll("[\"\\r\\n]", "_");
        ex.getResponseHeaders().set("Content-Type", "application/octet-stream");
        ex.getResponseHeaders().set("Content-Disposition", "attachment; filename=\"" + fname + "\"");
        ex.sendResponseHeaders(200, f.length());
        try (OutputStream os = ex.getResponseBody(); FileInputStream fis = new FileInputStream(f)) {
            fis.transferTo(os);
        }
    }

    // ---------- customer portal ----------
    static void myShipments(HttpExchange ex) throws Exception {
        JSONObject p = authCust(ex);
        if (p == null) { err(ex, 401, "unauthorized"); return; }
        send(ex, 200, q("SELECT id, awb, provider, service, ship_date, from_pincode, from_country, to_company, to_country, box_count, chargeable_weight, rate, amount, status FROM shipments WHERE customer_id=? ORDER BY ship_date DESC, id DESC", p.getLong("cid")).toString());
    }

    static void myShipmentDetail(HttpExchange ex, long id) throws Exception {
        JSONObject p = authCust(ex);
        if (p == null) { err(ex, 401, "unauthorized"); return; }
        JSONObject s = q1("SELECT * FROM shipments WHERE id=? AND customer_id=?", id, p.getLong("cid"));
        if (s == null) { err(ex, 404, "not found"); return; }
        s.put("boxes", q("SELECT count, length, width, height, weight, divisor FROM boxes WHERE shipment_id=?", id));
        s.put("documents", q("SELECT id, original_name, size, uploaded_at FROM documents WHERE shipment_id=?", id));
        send(ex, 200, s.toString());
    }

    // ---------- static files ----------
    static final Map<String, String> MIME = Map.ofEntries(
        Map.entry("html", "text/html; charset=utf-8"), Map.entry("css", "text/css"),
        Map.entry("js", "application/javascript"), Map.entry("mjs", "application/javascript"),
        Map.entry("map", "application/json"), Map.entry("json", "application/json"),
        Map.entry("woff2", "font/woff2"), Map.entry("png", "image/png"),
        Map.entry("jpg", "image/jpeg"), Map.entry("svg", "image/svg+xml"),
        Map.entry("ico", "image/x-icon")
    );

    static void serveStatic(HttpExchange ex, String p) throws Exception {
        if (p.equals("/")) p = "/index.html";
        if (p.equals("/admin") || p.startsWith("/admin/")) p = "/admin.html";
        File root = new File("public").getCanonicalFile();
        File f = new File(root, p).getCanonicalFile();
        if (!f.getPath().startsWith(root.getPath()) || !f.isFile()) { err(ex, 404, "not found"); return; }
        String ext = f.getName().contains(".") ? f.getName().substring(f.getName().lastIndexOf('.') + 1) : "";
        ex.getResponseHeaders().set("Content-Type", MIME.getOrDefault(ext, "application/octet-stream"));
        ex.sendResponseHeaders(200, f.length());
        try (OutputStream os = ex.getResponseBody(); FileInputStream fis = new FileInputStream(f)) {
            fis.transferTo(os);
        }
    }
}
