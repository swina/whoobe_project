<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-bold text-slate-100 light:text-slate-900">Outgoing Mail</h2>
      <p class="text-xs text-slate-400 light:text-slate-600">
        SMTP configuration, reusable mail templates, test delivery, and the sent-mail log.
      </p>
    </div>
    <MailSettingsCard />
  </div>
</template>

<script setup lang="ts">
// Main sidebar section for outgoing mail (Settings → Mail promoted to its
// own main item). Renders the same MailSettingsCard the Settings sub-section
// used to host (Settings, Email Test, Mail Log, Templates tabs).
import MailSettingsCard from '../components/settings/MailSettingsCard.vue'
</script>
