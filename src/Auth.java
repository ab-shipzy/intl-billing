import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import org.json.JSONObject;

/** HMAC-signed session tokens + PBKDF2 password hashing (JDK-only, no deps). */
public class Auth {
    static final String SECRET = System.getenv().getOrDefault("SECRET", "change-me-in-railway-env");

    static String b64url(byte[] b) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    static byte[] hmac(String s) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(s.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    static String sign(JSONObject payload) {
        String body = b64url(payload.toString().getBytes(StandardCharsets.UTF_8));
        return body + "." + b64url(hmac(body));
    }

    static JSONObject verify(String token) {
        try {
            if (token == null || !token.contains(".")) return null;
            int i = token.lastIndexOf('.');
            String body = token.substring(0, i), sig = token.substring(i + 1);
            String expect = b64url(hmac(body));
            if (!MessageDigest.isEqual(sig.getBytes(StandardCharsets.UTF_8), expect.getBytes(StandardCharsets.UTF_8))) return null;
            JSONObject p = new JSONObject(new String(Base64.getUrlDecoder().decode(body), StandardCharsets.UTF_8));
            if (p.has("exp") && p.getLong("exp") < System.currentTimeMillis()) return null;
            return p;
        } catch (Exception e) { return null; }
    }

    static String hashPassword(String pw) {
        try {
            byte[] salt = new byte[16];
            new SecureRandom().nextBytes(salt);
            int iter = 120000;
            byte[] h = pbkdf2(pw, salt, iter);
            return "pbkdf2$" + iter + "$" + Base64.getEncoder().encodeToString(salt) + "$" + Base64.getEncoder().encodeToString(h);
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    static boolean checkPassword(String pw, String stored) {
        try {
            String[] parts = stored.split("\\$");
            if (parts.length != 4) return false;
            int iter = Integer.parseInt(parts[1]);
            byte[] salt = Base64.getDecoder().decode(parts[2]);
            byte[] expect = Base64.getDecoder().decode(parts[3]);
            return MessageDigest.isEqual(pbkdf2(pw, salt, iter), expect);
        } catch (Exception e) { return false; }
    }

    static byte[] pbkdf2(String pw, byte[] salt, int iter) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(pw.toCharArray(), salt, iter, 256);
        return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
    }
}
