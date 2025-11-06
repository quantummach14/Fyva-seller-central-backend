const axios = require('axios');
class RequestApi {
    async axiosCall(url, type, headers = {}, body = {}, params = {}) {
        return new Promise(async (resolve) => {
            try {
                if (url === '') {
                    console.log('URL not mentioned');
                    return resolve(false);
                }
                if (!['get', 'post'].includes(type.toLowerCase())) {
                    console.log('Method type is unidentified');
                    return resolve(false);
                }
                let resp;
                if (type.toLowerCase() === 'get') {
                    resp = await axios.get(url, { params, headers });
                } else if (type.toLowerCase() === 'post') {
                    resp = await axios.post(url, body, { headers });
                } else {
                    console.log('Unidentified axios request');
                    return resolve(false);
                }

                if (resp.status === 200 || resp.status === 201) {
                    return resolve(resp.data);
                } else {
                    console.log('Unexpected response status:', resp.status);
                    return resolve(false);
                }
            } catch (error) {
                console.error('Axios request failed:', error);
                return resolve(false);
            }
        });
    }
}

module.exports = RequestApi;