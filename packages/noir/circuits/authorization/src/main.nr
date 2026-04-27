// This authorization circuit proves the same generic claim our SDK executors
// expect: an agent can act only when its credential, policy, action type,
// expiry windows, per-action amount, and cumulative budget agree. The circuit is
// intentionally domain-neutral; `amount` can mean spend, quantity, API-call
// cost, risk units, or any other app-defined scalar budget.
fn main(
    public_agent_id_hash: pub Field,
    public_policy_hash: pub Field,
    public_action_type_hash: pub Field,
    credential_agent_id_hash: Field,
    credential_policy_hash: Field,
    allowed_action_type_hash: Field,
    now: u64,
    credential_expires_at: u64,
    policy_expires_at: u64,
    action_amount: u64,
    max_action_amount: u64,
    cumulative_amount: u64,
    max_cumulative_amount: u64,
) {
    assert(public_agent_id_hash == credential_agent_id_hash, "agent identity must match credential");
    assert(public_policy_hash == credential_policy_hash, "policy commitment must match credential");
    assert(public_action_type_hash == allowed_action_type_hash, "action type must be allowed");
    assert(now <= credential_expires_at, "credential must not be expired");
    assert(now <= policy_expires_at, "policy must not be expired");
    assert(action_amount <= max_action_amount, "action amount must stay within policy");
    assert(cumulative_amount + action_amount <= max_cumulative_amount, "cumulative amount must stay within policy");
}

#[test]
fn accepts_valid_authorization() {
    main(
        1,
        2,
        3,
        1,
        2,
        3,
        100,
        200,
        300,
        250,
        250,
        700,
        1000,
    );
}

#[test(should_fail_with = "action amount must stay within policy")]
fn rejects_amount_above_policy_bound() {
    main(
        1,
        2,
        3,
        1,
        2,
        3,
        100,
        200,
        300,
        251,
        250,
        700,
        1000,
    );
}

#[test(should_fail_with = "cumulative amount must stay within policy")]
fn rejects_cumulative_amount_above_policy_bound() {
    main(
        1,
        2,
        3,
        1,
        2,
        3,
        100,
        200,
        300,
        350,
        500,
        700,
        1000,
    );
}

#[test(should_fail_with = "policy commitment must match credential")]
fn rejects_policy_mismatch() {
    main(
        1,
        2,
        3,
        1,
        999,
        3,
        100,
        200,
        300,
        250,
        250,
        700,
        1000,
    );
}
