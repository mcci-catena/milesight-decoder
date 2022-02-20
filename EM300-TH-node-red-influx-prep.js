// Convert decoded data in msg into form needed by InfluxDB OUT nodes.
//
// InfluxDB OUT nodes generally require that payload be an array.
// The elements of the array are interpreted in pairs. The first
// element of each pair is an object containing values to be recorded
// in the target measurement. The second element of each pair lists
// the tag names and tag values to be associated with the values.
// (Recall that Influx can query based on tags, and can do math on
// values selected by tags.)
//
// The first element has a special entry: time. If time is set, it
// is used as the time coordinate for all the other values in the
// observation.
//
// The input to this example is assumed to be decoded by the
// Milesight AM100 decoder when applied to messages from the EM300-TH.
// So this example is not at all general-purpose. But it shows the key
// steps in preparing input for Influx using Node RED.
//

// msg_out.payload[0] will get the converted sensor values
// msg_out.payload[1] will get the tags for this measurement.
// Let's use variables to save typing.
var values = {};
var tags = {};

//
// Initalize the output message, with an array with two elements.
// Recall that values is a reference to the actual object; so
// after this statement, values refers to the same object as
// msg_out.payload[0], and tags is the same as msg_out.payload[1].
//
// By convention, we pass along the topic. Influx doesn't use it.
//
var msg_out = { payload: [ values, tags ], topic: msg.topic };

//
// Start by setting the time to the uplink time from the input
// message. Remember to set the time resolution in the influx out
// node to milliseconds.
//
values.time = new Date(msg.received_at);

// Copy values from the input message to the output. The decoder
// follows the message from the device, and omits values that were
// not transmitted by the device. So we have to check before we
// try to copy/
if ("temperature" in msg.payload)
    values.temperature = msg.payload.temperature;

if ("humidity" in msg.payload)
    values.humidity = msg.payload.humidity;

if ("tDewC" in msg.payload)
    values.tDewpoint = msg.payload.tDewC;

// The input heat index will be null if the NWS calculation returns
// null (meaning that heat index is not defined). In that case, we
// substitute the temperature. We have to be careful because the
// temperature might also be null (at least in theory).
if ("tHeatIndexC" in msg.payload) {
    if (! (msg.payload.tHeatIndexC === null))
        values.tHeatIndex = msg.payload.tHeadIndex;
    else if ("temperature" in msg.payload)
        values.tHeatIndex = msg.payload.temperature;
}
if ("battery" in msg.payload) {
    values.battery = msg.payload.battery;
}

//
// We have found it convenient to include "metadata" in the
// database. These allow you to look at the data to see how
// well the devices and network are performing.  We assume
// Things Stack V3 formatting for the input message; this means
// we don't have to check as carefully.
//
values.uplinkCount = msg.payload_input.uplink_message.f_cnt;
values.rssi = msg.payload_input.uplink_message.rx_metadata[0].rssi;
values.snr = msg.payload_input.uplink_message.rx_metadata[0].snr;
values.bandwidth = msg.payload_input.uplink_message.settings.data_rate.lora.bandwidth;
values.spreading_factor = msg.payload_input.uplink_message.settings.data_rate.lora.spreading_factor;

//
// Compute the tags. In this example, we tag only by device_id
// and deveui. It might also be interesting to tag by gateway(s)
// and or by location.
//
tags.device_id = msg.device_id;
tags.dev_eui = msg.dev_eui;

// finally, return the resulting output message.
return msg_out;
