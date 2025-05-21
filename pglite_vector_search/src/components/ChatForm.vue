<script setup lang="ts">
import { ref, computed, onUpdated } from 'vue'
import { useChatStore } from '@/stores/chatMessage'

const chatStore = useChatStore()

const sendMessage = ref('')
const isLoading = computed((): boolean => {
    return chatStore.isLoading
})

const onSendMessage = (): void => {
    chatStore.isLoading = true
    chatStore.addUserMessage(sendMessage.value)
    chatStore.getBotReply(sendMessage.value)
    sendMessage.value = ''
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
        <input type="text" id="sendMessage" v-model="sendMessage" required class="input-text" />
        <button type="submit" v-bind:disabled="isLoading">送信</button>
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
}
</style>