<script setup lang="ts">
import LanguageSelector from '@/components/LanguageSelector.vue'
import QRCodeScan from '@/components/QRCodeScan.vue'
import QRCodeCreate from '@/components/QRCodeCreate.vue'
import AppFooter from '@/components/AppFooter.vue'
import useDarkModePreference from '@/utils/useDarkModePreference'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { isDarkMode, isDarkModePreferenceSetBySystem, toggleDarkModePreference } =
  useDarkModePreference()

const capturedData = ref<string>('')
const qrCodeScanRef = ref<InstanceType<typeof QRCodeScan> | null>(null)

// #region App mode
enum AppMode {
  Create = 'create',
  Scan = 'scan'
}

const appMode = ref<AppMode>(AppMode.Create)
const setAppMode = (mode: AppMode) => {
  if (
    appMode.value === AppMode.Scan &&
    mode === AppMode.Create &&
    qrCodeScanRef.value?.capturedData
  ) {
    capturedData.value = qrCodeScanRef.value.capturedData
  }

  appMode.value = mode
}

const useCapturedDataInCreateMode = (data: string) => {
  capturedData.value = data
  appMode.value = AppMode.Create
}

const isModeToggleDisabled = computed(() => {
  return appMode.value === AppMode.Scan && !!qrCodeScanRef.value && !!qrCodeScanRef.value.isLoading
})
// #endregion
</script>

<template>
  <main class="studio-shell">
    <header class="studio-header">
      <a
        href="#"
        class="studio-brand"
        aria-label="MiniQR"
        @click.prevent="setAppMode(AppMode.Create)"
      >
        <span class="brand-mark" aria-hidden="true">▦</span> MiniQR<span class="brand-dot">.</span>
      </a>
      <nav class="studio-nav" :aria-label="t('QR code settings')">
        <button
          :class="{ active: appMode === AppMode.Create }"
          :aria-pressed="appMode === AppMode.Create"
          :disabled="isModeToggleDisabled"
          @click="setAppMode(AppMode.Create)"
        >
          {{ t('Create') }}
        </button>
        <button
          :class="{ active: appMode === AppMode.Scan }"
          :aria-pressed="appMode === AppMode.Scan"
          :disabled="isModeToggleDisabled"
          @click="setAppMode(AppMode.Scan)"
        >
          {{ t('Scan') }}
        </button>
      </nav>
      <div class="studio-utilities">
        <button
          class="theme-control"
          @click="toggleDarkModePreference"
          :aria-label="t('Toggle dark mode')"
        >
          {{ isDarkModePreferenceSetBySystem ? '◐' : isDarkMode ? '☀' : '☾' }}
        </button>
        <LanguageSelector />
      </div>
    </header>
    <div class="studio-content">
      <div class="studio-intro">
        <span class="studio-eyebrow">MINI QR · STUDIO</span>
        <!--
        <h1>
          {{ appMode === AppMode.Create ? t('Your idea. One scan away.') : t('Scan a QR code') }}
        </h1>
        <p>
          {{
            appMode === AppMode.Create
              ? t('Add your content, make it yours, and share it with the world.')
              : t('Scan QR codes using your camera or an image.')
          }}
        </p>
        -->
      </div>
      <QRCodeCreate v-if="appMode === AppMode.Create" :initial-data="capturedData" />
      <div v-else class="studio-scanner">
        <QRCodeScan ref="qrCodeScanRef" @create-qr="useCapturedDataInCreateMode" />
      </div>
    </div>
    <AppFooter />
  </main>
</template>
