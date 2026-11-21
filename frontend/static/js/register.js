/* ==========================================================================
   register.js — Citizen Emergency Alert Subscription Registration
   ========================================================================== */

const KARNATAKA_DISTRICTS = [
  "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban",
  "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga",
  "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri",
  "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur",
  "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada",
  "Vijayanagara", "Vijayapura", "Yadgir"
];

function renderRegister() {
  const main = layout("register");

  const districtOpts = KARNATAKA_DISTRICTS.map(d =>
    `<option value="${d}" ${d === "Bengaluru Urban" ? "selected" : ""}>${d}</option>`
  ).join("");

  main.innerHTML = `
    <div style="max-width:540px; margin:30px auto; padding:32px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:12px; box-shadow:var(--shadow-command)">
      
      <div style="text-align:center; margin-bottom:24px">
        <div style="font-size:32px; margin-bottom:8px">📝</div>
        <h1 style="font-size:22px; font-weight:800; color:var(--text-main)">
          Citizen Alert Subscription Registration
        </h1>
        <p style="font-size:13px; color:var(--text-dim); margin-top:6px">
          Subscribe to location-aware official meteorological warnings, extreme heat alerts, and flood advisories for your district in Karnataka.
        </p>
      </div>

      <div id="regAlertBox" style="display:none; margin-bottom:18px; padding:12px 14px; border-radius:6px; font-size:13px; line-height:1.4"></div>

      <form id="registerForm" onsubmit="handleRegisterSubmit(event)">
        <div style="margin-bottom:14px">
          <label for="regFullName" style="display:block; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:5px">
            Full Name *
          </label>
          <input type="text" id="regFullName" required placeholder="e.g. Ramesh Kumar"
                 style="width:100%; padding:9px 13px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px; font-size:13.5px">
        </div>

        <div class="grid grid-2" style="margin-bottom:14px; gap:12px">
          <div>
            <label for="regEmail" style="display:block; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:5px">
              Email Address *
            </label>
            <input type="email" id="regEmail" required placeholder="ramesh@example.com"
                   style="width:100%; padding:9px 13px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px; font-size:13.5px">
          </div>
          <div>
            <label for="regMobile" style="display:block; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:5px">
              Mobile Number
            </label>
            <input type="tel" id="regMobile" placeholder="98XXXXXXXX"
                   style="width:100%; padding:9px 13px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px; font-size:13.5px">
          </div>
        </div>

        <div class="grid grid-2" style="margin-bottom:14px; gap:12px">
          <div>
            <label for="regDistrict" style="display:block; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:5px">
              Primary District *
            </label>
            <select id="regDistrict" class="form-select"
                    style="width:100%; padding:9px 13px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px; font-size:13.5px">
              ${districtOpts}
            </select>
          </div>
          <div>
            <label for="regLocality" style="display:block; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:5px">
              Locality / Taluk
            </label>
            <input type="text" id="regLocality" placeholder="e.g. Yelahanka / Ward 4"
                   style="width:100%; padding:9px 13px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px; font-size:13.5px">
          </div>
        </div>

        <div class="grid grid-2" style="margin-bottom:18px; gap:12px">
          <div>
            <label for="regPassword" style="display:block; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:5px">
              Password (min 8 chars) *
            </label>
            <input type="password" id="regPassword" required minlength="8" placeholder="••••••••••••"
                   style="width:100%; padding:9px 13px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px; font-size:13.5px">
          </div>
          <div>
            <label for="regConfirmPassword" style="display:block; font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:5px">
              Confirm Password *
            </label>
            <input type="password" id="regConfirmPassword" required minlength="8" placeholder="••••••••••••"
                   style="width:100%; padding:9px 13px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px; font-size:13.5px">
          </div>
        </div>

        <div style="margin-bottom:20px; padding:12px; background:var(--bg-base); border:1px solid var(--border-subtle); border-radius:6px">
          <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; font-size:12.5px; color:var(--text-dim)">
            <input type="checkbox" id="regConsent" required checked style="margin-top:2px">
            <span>
              I consent to receiving official emergency weather notifications and early warnings for my selected district in Karnataka.
            </span>
          </label>
        </div>

        <button type="submit" id="regBtn"
                style="width:100%; padding:11px; background:var(--cyan); color:#050505; font-weight:800; font-size:14px; border:none; border-radius:6px; cursor:pointer">
          REGISTER & ACTIVATE ALERT SUBSCRIPTION
        </button>
      </form>

      <div style="text-align:center; margin-top:22px; padding-top:16px; border-top:1px solid var(--border-subtle); font-size:13px; color:var(--text-dim)">
        Already have an account?
        <a href="/login" style="color:var(--cyan); font-weight:700; margin-left:4px">Sign In here</a>
      </div>
    </div>
  `;
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const alertBox = document.getElementById("regAlertBox");
  const btn = document.getElementById("regBtn");

  const full_name = document.getElementById("regFullName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const mobile_number = document.getElementById("regMobile").value.trim();
  const primary_district = document.getElementById("regDistrict").value;
  const locality = document.getElementById("regLocality").value.trim();
  const password = document.getElementById("regPassword").value;
  const confirm_password = document.getElementById("regConfirmPassword").value;
  const consent_given = document.getElementById("regConsent").checked;

  if (password !== confirm_password) {
    alertBox.style.display = "block";
    alertBox.style.background = "rgba(239,68,68,0.15)";
    alertBox.style.border = "1px solid rgba(239,68,68,0.4)";
    alertBox.style.color = "#ef4444";
    alertBox.textContent = "Passwords do not match.";
    return;
  }

  alertBox.style.display = "none";
  btn.disabled = true;
  btn.textContent = "REGISTERING ACCOUNT...";

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name,
        email,
        mobile_number,
        primary_district,
        locality,
        password,
        confirm_password,
        consent_given,
      }),
    });
    const data = await res.json();

    if (data.status === "success") {
      alertBox.style.display = "block";
      alertBox.style.background = "rgba(16,185,129,0.15)";
      alertBox.style.border = "1px solid rgba(16,185,129,0.4)";
      alertBox.style.color = "#10b981";
      alertBox.textContent = "Registration successful! Redirecting to login...";

      setTimeout(() => {
        window.location.href = "/login";
      }, 1000);
    } else {
      alertBox.style.display = "block";
      alertBox.style.background = "rgba(239,68,68,0.15)";
      alertBox.style.border = "1px solid rgba(239,68,68,0.4)";
      alertBox.style.color = "#ef4444";
      alertBox.textContent = data.message || "Registration failed.";
    }
  } catch (err) {
    alertBox.style.display = "block";
    alertBox.style.background = "rgba(239,68,68,0.15)";
    alertBox.style.border = "1px solid rgba(239,68,68,0.4)";
    alertBox.style.color = "#ef4444";
    alertBox.textContent = "Network error while connecting to registration service.";
  } finally {
    btn.disabled = false;
    btn.textContent = "REGISTER & ACTIVATE ALERT SUBSCRIPTION";
  }
}

document.addEventListener("DOMContentLoaded", renderRegister);
