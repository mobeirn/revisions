const BLOCKED_START = 'BLOCKED changed from [false] to [true]';
const BLOCKED_END = 'BLOCKED changed from [true] to [false]';

var startBlocked;
var endBlocked;

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    _artifacts:[],

    launch: function() {
        var today = new Date().toISOString();
        var me = this;
        // var selectedReleaseRef = me.down('#release-combobox').getRecord().get('_ref');
        // var storeFilters = me._getFilters(selectedReleaseRef);

        //TODO: Change to Artifact store to handle defects as well
        var artifacts = Ext.create('Rally.data.wsapi.Store', {
            model: 'UserStory',
            fetch: ['ObjectID', 'FormattedID','Name','RevisionHistory','Revisions','Description','User'],
            autoLoad: true,
            // filters: storeFilters
        });
        artifacts.load().then({
            success: this._getRevHistoryModel,
            scope: this
        }).then({
            success: this._onRevHistoryModelCreated,
            scope: this
        }).then({
            success: this._onModelLoaded,
            scope: this
        }).then({
            success: this._stitchDataTogether,
            scope: this
        }).then({
            success:function(results) {
                me._addReleaseCombo();
                me._makeGrid(results);
            },
            failure: function(){
                console.log("oh noes!");
            }
        });
    },
    _getRevHistoryModel:function(artifacts){
        this._artifacts = artifacts;
        return Rally.data.ModelFactory.getModel({
            type: 'RevisionHistory'
        });
    },
  _onRevHistoryModelCreated: function(model) {
    console.log('Revision history model: ', model);
    var promises = [];
    _.each(this._artifacts, function(artifact){
      var ref = artifact.get('RevisionHistory')._ref;
      console.log(artifact.get('FormattedID'), ref);
        promises.push(model.load(Rally.util.Ref.getOidFromRef(ref)));
    }); 
    return Deft.Promise.all(promises);  
   },
    
    _onModelLoaded: function (histories) {
        // console.log('Revision histories: ', histories);
        var promises = [];
        _.each(histories, function (history) {
            var revisions = history.get('Revisions');
            revisions.store = history.getCollection('Revisions', { fetch: ['User', 'Description', 'CreationDate', 'RevisionNumber'] });
            promises.push(revisions.store.load());
        });
        return Deft.Promise.all(promises);
    },
    _stitchDataTogether: function (revhistories) {
        var me = this;
        var artifactsWithRevs = [];
        _.each(me._artifacts, function (artifact) {
            artifactsWithRevs.push({ artifact: artifact.data });
        });
        var i = 0;
        _.each(revhistories, function (revisions) {
            console.log('Revs: ', revisions);
            _.each(revisions, function (revision) {
                //logic for getting blocked stories here
                if (revision.data.Description.includes(BLOCKED_START) || revision.data.Description.includes(BLOCKED_END)) {
                    console.log('Revision ' + revision.data.RevisionNumber + ' blocked:' + revision);
                }
            });
            artifactsWithRevs[i].revisions = revisions;
            i++;
        });
        return artifactsWithRevs;

    },
    _addReleaseCombo: function () {
        console.log('Adding Release combo box');
        var me = this;
        me.add(
            {
                xtype: 'rallyreleasecombobox',
                itemId: 'release-combobox',
                fieldLabel: 'Release',
                labelAlign: 'right',
                //  listeners: {
                //      ready: me._makeGrid,
                //      scope: me
                //  }
            }
        );
        
    },
    _getFilters: function (releaseValue) {

        var releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
            property: 'Release',
            value: releaseValue
        });
        // return iterationFilter.and(severityFilter);
        return releaseFilter;
    },

    _makeGrid: function(artifactsWithRevs){
      console.log('Artifacts with Revs: ', artifactsWithRevs);

        this.add({
            xtype: 'rallygrid',
            showPagingToolbar: true,
            showRowActionsColumn: false,
            editable: false,
            store: Ext.create('Rally.data.custom.Store', {
                data: artifactsWithRevs
            }),
            columnCfgs: [
                {
                    text: 'FormattedID', dataIndex: 'artifact', 
                      renderer:function(value){
                        return '<a href="https://rally1.rallydev.com/#/detail/userstory/' + value.ObjectID + '" target="_blank">' + value.FormattedID + '</a>';
                    }
                },
                {
                    text: 'Name', dataIndex: 'artifact', 
                      renderer:function(value){
                        return value.Name;
                    }
                },
                {
                    text: 'Hours blocked', dataIndex: 'revisions', flex: 1,
                    renderer: function (value) {
                        var totalHoursBlocked = 0;

                        _.each(value, function (rev) {
                            if (rev.data.Description.includes(BLOCKED_START)) {
                                // console.log('Found blocked')
                                startBlocked = rev.data.CreationDate;
                                totalHoursBlocked += _getHoursBlocked();

                            }
                            else if (rev.data.Description.includes(BLOCKED_END)) {
                                // console.log('Found unblocked');
                                endBlocked = rev.data.CreationDate;
                            }

                        });
                        return totalHoursBlocked;
                    }
                },
            ]
        });
        
    }
    
});

function _getHoursBlocked() {
    return Rally.util.DateTime.getDifference(endBlocked, startBlocked, 'hour');
}

