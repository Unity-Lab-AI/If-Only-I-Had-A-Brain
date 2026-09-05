//! `unity-sizing` CLI — answer the sizing questions from outside the brain.
//!
//! ⭐ Exists so the arithmetic can be interrogated **without booting anything**,
//! which is §5.1's stated reason for isolating this crate. *"Why is she this
//! size?"* has cost this project more time than almost any other question, and
//! until now the only way to ask it was to boot her and read a log line.
//!
//! ⚠ Emits JSON so a caller can consume it rather than parse prose. That also
//! makes it the parity harness's counterpart: the same inputs go to the JS and
//! to this, and the outputs are compared.

use unity_sizing::*;

fn arg(name: &str) -> Option<String> {
    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        if let Some(v) = a.strip_prefix(&format!("--{name}=")) { return Some(v.to_string()); }
        if a == format!("--{name}") { return it.next(); }
    }
    None
}
fn num(name: &str, d: f64) -> f64 { arg(name).and_then(|v| v.parse().ok()).unwrap_or(d) }
fn flag(name: &str) -> bool { std::env::args().any(|a| a == format!("--{name}")) }

fn main() {
    if flag("help") {
        println!("unity-sizing --baseline-mb N --bytes-per-neuron N --persisted-target N \\");
        println!("             --language-cortex-weight F --weight-sum F --os-reserve-mb N \\");
        println!("             --env-budget-mb N --safe-mb N --host-ram-mb N \\");
        println!("             --donor-fit-mb N [--deploy-donor-mode]");
        return;
    }

    let baseline_mb = clamp_baseline_mb(num("baseline-mb", 16_384.0));
    let bpn = clamp_bytes_per_neuron(num("bytes-per-neuron", 20.0));
    let persisted = num("persisted-target", 0.0) as u64;

    let cap = donor_capacity_neurons(baseline_mb, bpn);
    let tier = tier_for_capacity(cap);
    let seeded = self_seed_tier(baseline_mb, bpn, persisted);
    let target = seeded.map(|(_, t)| t).unwrap_or(persisted);

    let lc = num("language-cortex-weight", 0.50);
    let ws = num("weight-sum", 1.0);
    let mf = main_fraction(lc, ws);
    let os_reserve = num("os-reserve-mb", 2048.0) as u64;
    let required = tier_required_mb(target, mf, os_reserve);

    let b = choose_budget(BudgetInputs {
        env_budget_mb: num("env-budget-mb", 0.0) as u64,
        tier_required_mb: required,
        safe_mb: num("safe-mb", 18_519.0) as u64,
        host_ram_mb: num("host-ram-mb", 31_831.0) as u64,
        deploy_donor_mode: flag("deploy-donor-mode"),
        donor_fit_default_mb: num("donor-fit-mb", 4096.0) as u64,
    });

    let basis = match &b.basis {
        BudgetBasis::EnvOverride => "env-override".to_string(),
        BudgetBasis::TierTarget { required_mb, fits_box } =>
            format!("tier-target(required={required_mb},fitsBox={fits_box})"),
        BudgetBasis::DonorFit => "donor-fit".to_string(),
        BudgetBasis::HostSafeMax => "host-safe-max".to_string(),
    };

    println!("{{");
    println!("  \"donorCapacityNeurons\": {cap},");
    println!("  \"tier\": {tier},");
    println!("  \"selfSeeded\": {},", if seeded.is_some() { "true" } else { "false" });
    println!("  \"targetNeurons\": {target},");
    println!("  \"mainFraction\": {mf},");
    println!("  \"tierRequiredMB\": {required},");
    println!("  \"budgetMB\": {},", b.budget_mb);
    println!("  \"basis\": \"{basis}\"");
    println!("}}");
}
