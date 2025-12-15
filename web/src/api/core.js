import axios from 'axios'

const apiClient = axios.create({
  baseURL: 'https://api-dev.alpn-software.com/api/v1/public',
  headers: {
    'Content-Type': 'application/json',
  },
})

export const fetchCV = async (format) => {
  return apiClient.get(`/resume?format=${format}`)
}

export const createContact = async (contactData) => {
  const payload = {
    email: contactData.email,
    name: contactData.name,
    message: contactData.message,
  }
  return apiClient.post('/contacts', payload)
}
