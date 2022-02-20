//
// Module:  EMT500-SMT-node-red.js
//
// Function:
//      This Node-RED decoding function decodes the record sent by the Milesight
//      EMT500-SMT sensor.
//
// License:
//      Copyright (C) 2020, 2022, MCCI Corporation.
//      See LICENSE in accompanying git repository.
//

// calculate dewpoint (degrees C) given temperature (C) and relative humidity (0..100)
// from http://andrew.rsmas.miami.edu/bmcnoldy/Humidity.html
// rearranged for efficiency and to deal sanely with very low (< 1%) RH
function dewpoint(t, rh) {
	var c1 = 243.04;
	var c2 = 17.625;
	var h = rh / 100;
	if (h <= 0.01)
	    h = 0.01;
	else if (h > 1.0)
	    h = 1.0;

	var lnh = Math.log(h);
	var tpc1 = t + c1;
	var txc2 = t * c2;
	var txc2_tpc1 = txc2 / tpc1;

	var tdew = c1 * (lnh + txc2_tpc1) / (c2 - lnh - txc2_tpc1);
	return tdew;
    }

/*

Name:   EM500-SMT.js

Function:
    Decode Milesight soil-monitoring port 85 messages for TTN console.

Copyright and License:
    See accompanying LICENSE file at https://github.com/mcci-catena/MCCI-Catena-PMS7003/

Author:
    Terry Moore, MCCI Corporation   September 2020

*/

// ttn v3 decoder
function decodeUplink(input)
    {
    return  { data: Decoder(input.bytes, input.fPort) };
    }

/**
 * Ursalink Sensor Payload Decoder
 *
 * definition [channel-id] [channel-type] [channel-data]
 *
 * 01: battery      -> 0x01 0x75 [1byte]   Unit:%
 * 03: Temperature  -> 0x03 0x67 [2bytes]  Unit:°C
 * 04: Moisture     -> 0x04 0x68 [1byte]   Unit:%RH
 * 05: Conductivity -> 0x05 0x7f [2bytes]  Unit:µs/cm
 * ------------------------------------------ EM500-SMT
 */
function Decoder(bytes, port) {
    var decoded = {};

    // accept either no port at all, or port 85
    if (! (port === undefined || port === 85)) {
        return null;
    }

    decoded.Error = false;
    for (var i = 0; i < bytes.length;) {
        // be robust
        if (i > bytes.length - 2) {
            // out of data.
            decoded.Error = true;
            break;
        }

        var channel_id = bytes[i++];
        var channel_type = bytes[i++];
        // BATTERY
        if (channel_id === 0x01 && channel_type === 0x75) {
            decoded.battery = bytes[i];
            i += 1;
        }
        // TEMPERATURE
        else if (channel_id === 0x03 && channel_type === 0x67) {
            decoded.temperature = readInt16LE(bytes.slice(i, i + 2)) / 10;
            i += 2;
        }
        // MOISTURE
        else if (channel_id === 0x04 && channel_type === 0x68) {
            decoded.humidity = bytes[i] / 2;
            i += 1;
        }
        // Electrical Conductivity
        else if (channel_id === 0x05 && channel_type === 0x7f) {
            decoded.conductivity= readInt16LE(bytes.slice(i, i + 2)) ;
            i += 2;
        }
        // SYSTEM
        else if (channel_id === 0xFF) {
            // FORMAT_VERSION
            if (channel_type === 0x01) {
                decoded.FormatVersion = bytes[i++];
                continue;
            }
            // HARDWARE_VERSION
            else if (channel_type === 0x09) {
                decoded.HardwareVersion = readVersion(bytes.slice(i, i+2));
                i += 2;
                continue;
            }
            // SOFTWARE_VERSION
            else if (channel_type === 0x0A) {
                decoded.SoftwareVersion = readVersion(bytes.slice(i, i+2));
                i += 2;
                continue;
            }
            // RESTART
            if (channel_type === 0x0B) {
                decoded.restart = 1;
                ++i;
                continue;
            }
            // POWER OFF
            if (channel_type === 0x0C) {
                decoded.shutdown = 1;
                ++i;
                continue;
            }
            // CLASS
            else if (channel_type === 0x0F) {
                decoded.Class = bytes[i++];
                continue;
            }
            // SERIAL_NUMBER
            else if (channel_type === 0x16) {
                decoded.SerialNumber = readHexBytes(bytes.slice(i, i+8));
                i += 8;
                continue;
            } else {
                decoded.Error = true;
                decoded.channel_id = channel_id;
                decoded.channel_type = channel_type;
                decoded.byte_position = i;
                decoded.ErrorType = "unknown channel type";
                break;
            }
        } else {
            decoded.Error = true;
            decoded.ErrorType = "unknown channel id";
            decoded.channel_id = channel_id;
            break;
        }
    }
    return decoded;
}
/* ******************************************
 * bytes to number
 ********************************************/
function readUInt16LE(bytes) {
    var value = (bytes[1] << 8) + bytes[0];
    return value & 0xffff;
}

function readInt16LE(bytes) {
    var ref = readUInt16LE(bytes);
    return ref > 0x7fff ? ref - 0x10000 : ref;
}

function readUInt16BE(bytes) {
    var value = (bytes[0] << 8) + bytes[1];
    return value;
}

function bcd2ToDecimal(value) {
    var result = value & 0xF;
    if (result > 9 || value >= 0xA0) {
        return 0;
    }
    return result + 10 * (value >> 4);
}

function bcd22ToVersion(value) {
    var result = bcd2ToDecimal(value >> 8) + (bcd2ToDecimal(value & 0xFF) / 100);
    return result;
}

function readVersion(bytes) {
    return bcd22ToVersion(readUInt16BE(bytes));
}

function encodeHex(byte) {
    return ("0" + byte.toString(16)).substr(-2);
}

function readHexBytes(bytes) {
    var result = "";
    for (var i = 0; i < bytes.length; ++i) {
        result = result + "-" + encodeHex(bytes[i]);
    }
    return result.substr(1);
}

/*

Node-RED function body.

Input:
    msg     the object to be decoded.

            msg.payload is assumed to be a string containing
            serialized JSON, as produced by the Things Stack.
            It is parsed, and the frm_payload is decoded
            to form the payload.

Returns:
    This function returns a message body. It's a mutation of the
    input msg; msg.payload is changed to the decoded data,
    msg.local is set to additional application-specific information,
    msg.payload_input is set to the decoded message from TTN,
    and msg.payload contains `temperature`, `humidity`,
    `tDewpoint`, and `battery`, along with
    various RF metrics.

*/

var b;

var payload = JSON.parse(msg.payload)

if ("frm_payload" in payload.uplink_message) {
    b = Buffer(payload.uplink_message.frm_payload, 'base64');  // pick up data for convenience
    // msg.payload_fields still has the decoded data
}
else {
    return { payload: { error: "No frm_payload in msg.payload" } }
}

var result = Decoder(b, payload.f_port);
var msg_out = {};

// include the input payload
msg_out.payload_input = payload;
msg_out.device_id = payload.end_device_ids.device_id;
msg_out.dev_eui = payload.end_device_ids.dev_eui;
msg_out.received_at = payload.received_at;

// calcluate the dewpoint
if ("temperature" in result && "humidity" in result)
    {
    result.tDewC = dewpoint(result.temperature, result.humidity);
    }

// now update msg with the new payload and new .local field
msg_out.topic = msg.topic;
msg_out.payload = result;
msg_out.local =
    {
        nodeType: "Milesight EM500-SMT",
        platformType: "Milesight EM500",
        radioType: "Milesight",
        applicationName: "Soil Monitor"
    };

return msg_out;
