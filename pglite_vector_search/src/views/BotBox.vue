<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/chatMessage'
import { MessageData } from '@/models/chatMessage'
import ChatForm from '@/components/ChatForm.vue'

const chatStore = useChatStore()
const messageList = computed((): Map<number, MessageData> => {
    return chatStore.messageList
})
</script>

<template>
    <div class="container">
        <template v-for="[id, message] in messageList" v-bind:key="id">
            <div v-if="message.isBot" class="bot-message">{{ message.message }}</div>
            <div v-else class="user-message">{{ message.message }}</div>
        </template>
        <ChatForm />
    </div>
</template>

<style scoped>
.user-message {
    max-width: 80%;
    width: auto;
    margin: 10px;
    padding: 10px;
    border-radius: 5px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
    align-self: flex-end;
    background-color: #2d81d8;
    color: white;
}

.bot-message {
    max-width: 80%;
    width: auto;
    margin: 10px;
    padding: 10px;
    border-radius: 5px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
    align-self: flex-start;
    background-color: #f2f2f2;
}

.container {
    flex: 1;
    padding: 20px;
    padding-bottom: 70px !important;
    display: flex;
    flex-direction: column;
}
</style>