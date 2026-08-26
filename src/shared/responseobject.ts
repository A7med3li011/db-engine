const obj: { statusCode: number; message: string; data: any } = {
  statusCode: 0,
  message: '',
  data: undefined,
};
export function handleResponse(status: number, message: string, data: any) {
  obj.statusCode = status;
  obj.message = message;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  if (data) obj.data = data;
}

export function getResponse() {
  return obj;
}
