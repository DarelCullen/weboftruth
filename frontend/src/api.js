import axios from 'axios';

const API_URL = 'http://localhost:8000';

export const fetchGraph = async () => {
    const response = await axios.get(`${API_URL}/graph/?t=${new Date().getTime()}`);
    return response.data;
};


export const fetchNodes = async () => {
    const response = await axios.get(`${API_URL}/nodes/`);
    return response.data;
};

export const fetchEdges = async () => {
    const response = await axios.get(`${API_URL}/edges/`);
    return response.data;
};

export const importWikipedia = async (title) => {
    const response = await axios.post(`${API_URL}/import/wikipedia`, { title });
    return response.data;
};

export const createNode = async (node) => {
    const response = await axios.post(`${API_URL}/nodes/`, node);
    return response.data;
};

export const deleteNode = async (nodeId) => {
    await axios.delete(`${API_URL}/nodes/${nodeId}`);
};


export const createEdge = async (edge) => {
    const response = await axios.post(`${API_URL}/edges/`, edge);
    return response.data;
};

export const uploadDocument = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_URL}/import/upload`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
    return response.data;
};


export const deleteGraph = async () => {
    await axios.delete(`${API_URL}/graph`);
};
