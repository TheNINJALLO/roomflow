// RoomFlow Supabase Endpoint Configuration
window.RoomFlowConfig = {
    supabaseUrl: "https://bjqvowghqajwudgyqnau.supabase.co",
    supabaseAnonKey: "sb_publishable_F3R00Fm2TVxOIPzT5-SSxw_dxLLcKu7"
};
// Phase 1 integration bootstrap. The integration waits for the main app and
// Supabase service to finish loading before patching any workflows.
(function loadRoomFlowIntegrations() {
    if (document.querySelector('script[data-roomflow-integrations]')) return;
    const script = document.createElement('script');
    script.src = 'roomflow-integrations.js?v=4';
    script.dataset.roomflowIntegrations = 'true';
    script.async = true;
    document.head.appendChild(script);
})();
