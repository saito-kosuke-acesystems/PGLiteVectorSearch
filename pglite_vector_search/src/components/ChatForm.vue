<script setup lang="ts">
import '@/assets/main.css'
import { ref, computed, onUpdated } from 'vue'
import { useChatStore } from '@/stores/chatMessage'

const chatStore = useChatStore()

const sendMessage = ref('')
const uploadedFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const isLoading = computed((): boolean => {
    return chatStore.isLoading
})

const onSendMessage = (): void => {
    chatStore.isLoading = true
    chatStore.addMessage(sendMessage.value)
    chatStore.getBotReply(sendMessage.value)
    sendMessage.value = ''
}

const onFileButtonClick = () => {
    fileInputRef.value?.click()
}

const onFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
        uploadedFile.value = target.files[0]
        chatStore.isLoading = true
        chatStore.addMessage(`ファイルを参考情報としてロードします。: ${uploadedFile.value.name}`, true)
        await chatStore.uploadFile(uploadedFile.value)
        uploadedFile.value = null
    }
}

onUpdated((): void => {
    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
    })
})
</script>

<template>
    <form v-on:submit.prevent="onSendMessage" class="send-form">
        <label class="file-upload-label">
            <input ref="fileInputRef" type="file" @change="onFileChange" class="file-input" style="display:none" />
            <button type="button" @click="onFileButtonClick" :disabled="isLoading" class="submit-btn">RAG追加</button>
        </label>
        <input type="text" id="sendMessage" v-model="sendMessage" required class="input-text" />
        <button type="submit" v-bind:disabled="isLoading" class="submit-btn">送信</button>
    </form>
</template>

<style>
</style>