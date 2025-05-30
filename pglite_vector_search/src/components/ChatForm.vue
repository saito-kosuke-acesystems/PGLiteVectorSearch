<script setup lang="ts">
import { ref, computed, onUpdated } from 'vue'
import { useChatStore } from '@/stores/chatMessage'

const chatStore = useChatStore()

const sendMessage = ref('')
const uploadedFile = ref<File | null>(null)

const isLoading = computed((): boolean => {
    return chatStore.isLoading
})

const onSendMessage = (): void => {
    chatStore.isLoading = true
    chatStore.addMessage(sendMessage.value)
    chatStore.getBotReply(sendMessage.value)
    sendMessage.value = ''
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
            <input type="file" @change="onFileChange" class="file-input" />
            <span class="submit-btn">RAG追加</span>
        </label>
        <input type="text" id="sendMessage" v-model="sendMessage" required class="input-text" />
        <button type="submit" v-bind:disabled="isLoading" class="submit-btn" >送信</button>
    </form>
</template>

<style scoped>
.input-text {
    flex: 1%;
    border: none;
    border-radius: 5px;
    padding: 10px;
    margin-right: 10px;
    margin-top: 5px;
    margin-bottom: 5px;
    font-size: 16px;
    height: 20px;
}

.send-form {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 10px;
    background-color: white;
    box-shadow: 0 -1px 5px rgba(0, 0, 0, 0.3);
    z-index: 1;
    align-items: center;
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
    font-size: 20px;
    padding: 4px 8px;
    border-radius: 4px;
    background: #f0f0f0;
    border: 1px solid #ccc;
    transition: background 0.2s;
}

.file-upload-btn:hover {
    background: #e0e0e0;
}
</style>