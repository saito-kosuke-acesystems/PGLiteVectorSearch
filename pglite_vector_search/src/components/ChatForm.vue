<script setup lang="ts">
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
        chatStore.addMessage(`ファイルをアップロードしています: ${uploadedFile.value.name}`, true)
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

<style scoped>
.input-text {
    flex: 1;
    border: 2px solid #007bff;
    border-radius: 5px;
    padding: 10px;
    margin-right: 10px;
    font-size: 16px;
    height: 20px;
    outline: none;
    transition: border-color 0.2s;
}

.input-text:focus {
    border-color: #0056b3;
    background-color: #eaf4ff;
}

.send-form {
    display: flex;
    width: 100%;
    padding: 0;
    background-color: transparent;
    z-index: 1;
    align-items: center;
    box-sizing: border-box;
}

.file-upload-label {
    display: flex;
    align-items: center;
    margin-right: 10px;
    cursor: pointer;
    position: relative;
}

.file-input {
    display: none;
}

.submit-btn {
    font-size: 16px;
    padding: 8px 16px;
    border-radius: 4px;
    background: #007bff;
    border: none;
    color: white;
    transition: background 0.2s;
    margin-right: 10px;
    cursor: pointer;
}
.submit-btn:last-child {
    background: #28a745;
    margin-right: 0;
}
.submit-btn:disabled {
    background: #b0b0b0;
    cursor: not-allowed;
}

.file-upload-btn:hover {
    background: #0056b3;
}
</style>