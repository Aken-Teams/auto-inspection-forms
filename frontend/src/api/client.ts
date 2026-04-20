import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
});

export default api;

// Upload
export const uploadFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const uploadBatch = (files: File[]) => {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  return api.post('/upload/batch', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// Results
export const getUploads = (page = 1, pageSize = 20) =>
  api.get('/results', { params: { page, page_size: pageSize } });

export const getUploadDetail = (id: number) =>
  api.get(`/results/${id}`);

export const getSheetResult = (id: number) =>
  api.get(`/results/sheet/${id}`);

// Specs
export const getFormTypes = () => api.get('/specs/form-types');

export const getFormSpecs = (formCode: string, includeItems = true) =>
  api.get(`/specs/form-types/${formCode}/specs`, { params: { include_items: includeItems } });

export const updateSpec = (specId: number, data: unknown) =>
  api.put(`/specs/specs/${specId}`, data);

export const deleteSpec = (specId: number) =>
  api.delete(`/specs/specs/${specId}`);

export const renameSpec = (specId: number, equipmentName: string) =>
  api.patch(`/specs/specs/${specId}`, { equipment_name: equipmentName });

export const createSpec = (formCode: string, data: { equipment_id: string; equipment_name: string }) =>
  api.post(`/specs/form-types/${formCode}/specs`, data);

export const importSpecs = (formCode: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/specs/import?form_code=${formCode}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const initFormTypes = () => api.post('/specs/init');

// Download
export const downloadSheet = (resultId: number) =>
  api.get(`/download/sheet/${resultId}`, { responseType: 'blob' });

export const downloadUpload = (uploadId: number) =>
  api.get(`/download/upload/${uploadId}`, { responseType: 'blob' });

export const downloadBatch = (uploadIds: number[]) =>
  api.post('/download/batch', { upload_ids: uploadIds }, { responseType: 'blob' });
