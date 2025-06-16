export interface MessageData {
  id: number
  message: string
  isBot: boolean
  isStreaming?: boolean
  streamingStartTime?: number
  responseTime?: number
  isFileUpload?: boolean
}

export interface SendMessage {
  message: string
}

export interface State {
  messageList: Map<number, MessageData>
  isLoading: boolean
}